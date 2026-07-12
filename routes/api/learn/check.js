export default function registerCheckRoute(router, helpers) {
    const {
        db,
        normalizeMastery,
        normalizeMasteryEntry,
        getMasteryScore,
        calculateTier,
        loadChapterFromSession,
        genResponse,
        fixJson,
        compareObjectiveAnswer,
        roundScore,
        safeParseJson,
        normalizeConceptList
    } = helpers;
    const objectiveTypes = new Set(["mcq", "truefalse", "matching", "ordering"]);

    function getSubjectiveMasteryShift(type, score) {
        const normalizedScore = Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0.5;

        let maxShift = 0.05;

        if (type === "longqa") maxShift = 0.08;
        if (type === "shortqa") maxShift = 0.06;
        if (type === "fillblanks") maxShift = 0.05;

        return roundScore((normalizedScore - 0.5) * 2 * maxShift, 4) ?? 0;
    }

    router.post('/check', async (req, res) => {
        try {
            if (!req.session.userId) {
                return res.status(401).json({ status: "401 UNAUTHORIZED" });
            }

            const { question, answer, type } = req.body;

            if (!question || !type) {
                return res.status(400).json({ error: "Invalid check data" });
            }

            const isSubjective = !objectiveTypes.has(String(type || "")) && req.session.currentSubjective !== false;

            if (isSubjective) {
                if (typeof answer !== "string" || !answer.trim()) {
                    return res.status(400).json({ error: "Invalid check data" });
                }
            } else if (answer == null) {
                return res.status(400).json({ error: "Invalid check data" });
            }

            req.session.mastery = normalizeMastery(req.session.mastery || {});
            req.session.lessonProgress ??= {
                questionsAsked: 0,
                masteryStart: structuredClone(req.session.mastery || {}),
                masteryGain: 0
            };

            console.debug("[learn/check] grading start", {
                type,
                isSubjective,
                question: String(question).slice(0, 120)
            });

            let data;

            if (!isSubjective) {
                const expectedAnswer = req.session.correctAnswer;

                console.debug("[learn/check] objective answer", {
                    type,
                    answer,
                    expectedAnswer
                });

                data = {
                    correct: compareObjectiveAnswer(answer, expectedAnswer, type),
                    explanation: req.session.explanation ?? "",
                    answer: expectedAnswer
                };
            } else {
                const syllabusText = await loadChapterFromSession(req, req.session.currentChapter);

                const prompt = `
                    Return ONLY JSON:
                    {
                        "correct": true/false,
                        "score": 0-1,
                        "explanation": "..."
                    }

                    Be warm, encouraging, and student-friendly.
                    Keep the explanation short: one or two sentences is enough.
                    Judge the answer by accuracy, completeness, clarity, relevance, and length.
                    Accept alternative correct answers when they show the same understanding.
                    Use the syllabus and question as reference, but do not quote it directly.
                    If the answer is correct, give a brief positive note.
                    If the answer is partly correct, say what is right and what is missing.
                    If the answer is wrong, explain gently what is missing or what the better answer should include.
                    Give a score from 0 to 1 where a weak answer gets a low score and a strong answer gets a high score.
                    Avoid stiff or robotic phrasing.
                    Question: ${question}
                    Answer: ${answer}
                    Type: ${type}
                    Syllabus: ${syllabusText}
                `;

                try {
                    const cleanText = fixJson(await genResponse(prompt));
                    const parsed = safeParseJson(cleanText);

                    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                        throw new Error("Invalid grader response");
                    }

                    data = parsed;
                } catch {
                    data = {
                        correct: false,
                        score: 0,
                        explanation: "I could not check that answer right now. Please try again."
                    };
                }
            }

            const concepts = normalizeConceptList(
                req.session.currentConcepts?.length ? req.session.currentConcepts : data.concept
            );

            const rawSubjectiveScore = Number(data.score);
            const fallbackScore = data.correct ? 0.75 : 0.25;
            const qualityScore = Number.isFinite(rawSubjectiveScore)
                ? rawSubjectiveScore
                : fallbackScore;
            const effectiveScore = data.correct
                ? Math.max(0.5, Math.min(1, qualityScore))
                : Math.min(0.5, Math.max(0, qualityScore));

            let difficultyImpact = 0.03;

            if (type === "longqa") difficultyImpact = 0.08;
            if (type === "shortqa") difficultyImpact = 0.06;
            if (type === "mcq") difficultyImpact = 0.04;
            if (type === "truefalse") difficultyImpact = 0.02;

            if (!data.correct) {
                if (type === "longqa") difficultyImpact = -0.08;
                if (type === "shortqa") difficultyImpact = -0.06;
                if (type === "mcq") difficultyImpact = -0.04;
                if (type === "truefalse") difficultyImpact = -0.02;
            }

            if (isSubjective) {
                difficultyImpact = getSubjectiveMasteryShift(type, effectiveScore);
            }

            for (const concept of concepts) {
                const existingEntry = req.session.mastery[concept];
                const normalizedEntry = normalizeMasteryEntry(existingEntry) || {
                    score: 0.5,
                    subject: req.session.subject ?? null,
                    chapter: req.session.currentChapter ?? null
                };
                const prev = getMasteryScore(normalizedEntry) ?? 0.5;
                const nextScore = roundScore(prev + difficultyImpact) ?? prev;

                req.session.mastery[concept] = {
                    ...normalizedEntry,
                    score: nextScore
                };

                console.debug("[learn/check] mastery update", {
                    concept,
                    prev,
                    next: nextScore,
                    delta: difficultyImpact,
                    qualityScore: effectiveScore
                });
            }

            req.session.tier = calculateTier(req.session.mastery);

            await db`
                UPDATE progress
                SET data =
                    ${JSON.stringify(req.session.mastery)}::jsonb
                WHERE user_id =
                    ${req.session.userId}
            `;

            let totalGain = 0;

            const allConcepts = new Set([
                ...Object.keys(req.session.lessonProgress.masteryStart),
                ...Object.keys(req.session.mastery)
            ]);

            for (const concept of allConcepts) {
                const before = getMasteryScore(req.session.lessonProgress.masteryStart[concept]) ?? 0.5;
                const after = getMasteryScore(req.session.mastery[concept]) ?? 0.5;

                totalGain += after - before;
            }

            req.session.lessonProgress.masteryGain = roundScore(totalGain, 4) ?? totalGain;

            req.session.lessonProgress.questionsAsked++;

            const lessonFinished =
                req.session.lessonProgress.masteryGain >= 0.15 ||
                req.session.lessonProgress.questionsAsked >= 15;

            res.status(200).json({
                data,
                lessonFinished,
                masteryGain: req.session.lessonProgress.masteryGain,
                questionsAsked: req.session.lessonProgress.questionsAsked
            });
        } catch (err) {
            return res.status(500).json({ status: "500 INTERNAL SERVER ERROR" });
        }
    });
}
