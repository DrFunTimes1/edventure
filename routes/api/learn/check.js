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
        roundNumber,
        safeParseJson,
        normalizeConceptList,
        buildNextLesson,
        saveLessonHistory
    } = helpers;
    const objectiveTypes = new Set(["mcq", "truefalse", "matching", "ordering"]);
    const logPrefix = "[LEARN/CHECK.JS]";
    const MAX_MASTERY_GAIN = 0.08;
    const MAX_MASTERY_LOSS = 0.08;

    function clampScore(value) {
        if (!Number.isFinite(value)) {
            return 0.5;
        }

        return Math.max(0, Math.min(1, value));
    }

    function getMasteryDeltaFromScore(score) {
        const normalizedScore = clampScore(score);
        const rawDelta = (normalizedScore - 0.5) * 2;
        const limitedDelta = rawDelta >= 0
            ? rawDelta * MAX_MASTERY_GAIN
            : rawDelta * MAX_MASTERY_LOSS;

        return roundNumber(Math.max(-MAX_MASTERY_LOSS, Math.min(MAX_MASTERY_GAIN, limitedDelta)), 4) ?? 0;
    }

    router.post('/check', async (req, res) => {
        try {
            if (!req.session.userId) {
                return res.status(401).json({ status: "401 UNAUTHORIZED" });
            }

            const { question, answer, type, questionId } = req.body;

            if (!question || !type) {
                return res.status(400).json({ error: "Invalid check data" });
            }

            const activeQuestionId = String(req.session.currentQuestionId ?? "").trim();
            const submittedQuestionId = String(questionId ?? "").trim();

            if (!activeQuestionId || !submittedQuestionId || submittedQuestionId !== activeQuestionId || req.session.questionChecked || req.session.questionCheckPending) {
                console.log(`${logPrefix} Duplicate submission blocked`);
                return res.status(200).json({
                    alreadyChecked: true,
                    questionCheckPending: Boolean(req.session.questionCheckPending),
                    message: "This question has already been checked."
                });
            }

            req.session.questionCheckPending = true;
            console.log(`${logPrefix} Question submission accepted`);

            const isSubjective = !objectiveTypes.has(String(type || "")) && req.session.currentSubjective !== false;

            if (isSubjective) {
                if (typeof answer !== "string" || !answer.trim()) {
                    return res.status(400).json({ error: "Invalid check data" });
                }
            } else if (answer == null) {
                return res.status(400).json({ error: "Invalid check data" });
            }

            console.log(`${logPrefix} User answer: ${String(answer).slice(0, 160)}`);

            req.session.mastery = normalizeMastery(req.session.mastery || {});
            req.session.lessonProgress ??= {
                questionsAsked: 0,
                masteryStart: structuredClone(req.session.mastery || {}),
                masteryGain: 0
            };

            console.log(`${logPrefix} Grading start: type=${type}, subjective=${isSubjective}, question=${String(question).slice(0, 120)}`);

            let data;

            if (!isSubjective) {
                const expectedAnswer = req.session.correctAnswer;

                console.log(`${logPrefix} Objective answer: expected=${JSON.stringify(expectedAnswer)}`);

                data = {
                    correct: compareObjectiveAnswer(answer, expectedAnswer, type),
                    explanation: req.session.explanation ?? "",
                    answer: expectedAnswer
                };
            } else {
                const syllabusText = await loadChapterFromSession(
                    req,
                    req.session.currentLesson?.chapterKey ?? req.session.currentChapter
                );

                const prompt = `
                    Return ONLY JSON:
                    {
                        "correct": true/false,
                        "score": 0-1,
                        "explanation": "..."
                    }

                    STYLE (MANDATORY)

                    The explanation MUST sound like a real teacher talking to a student.
                    Judge the answer relative to the question.
                    If the question asks for only a final answer, a short correct answer can score highly.
                    If the question asks for reasoning or explanation, missing that reasoning must lower the score.
                    Judge correctness, completeness, relevance, reasoning, and whether the important parts of the question were answered.
                    Do not automatically reward a short answer just because it is short.
                    Do not automatically penalize a short answer if the question only requires a concise response.

                    If the answer is correct:
                    - Start with encouragement such as:
                    "Great job!"
                    "Excellent work!"
                    "Nice thinking!"
                    "That's correct!"
                    - Then explain WHY the answer is correct in 1-2 short sentences.

                    If the answer is partly correct:
                    - First praise what was correct.
                    - Then gently explain what was missing.
                    - Never sound critical or robotic.

                    If the answer is incorrect:
                    - Never simply state the correct answer.
                    - Start with something encouraging like:
                    "Good try!"
                    "Nice attempt!"
                    "You're on the right track!"
                    "Don't worry—this one's a little tricky."
                    - Then explain the idea clearly and kindly.

                    Never sound like a textbook.
                    Never write only a definition.
                    Talk directly to the student using "you".
                    Keep explanations under 60 words.
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

            const aiScore = isSubjective
                ? Number(data.score)
                : (data.correct ? 1 : 0);
            const masteryScore = Number.isFinite(aiScore)
                ? aiScore
                : (isSubjective ? 0.5 : (data.correct ? 1 : 0));
            const masteryDelta = getMasteryDeltaFromScore(masteryScore);

            console.log(`${logPrefix} AI score: ${Number(masteryScore).toFixed(3)}`);

            for (const concept of concepts) {
                const existingEntry = req.session.mastery[concept];
                const normalizedEntry = normalizeMasteryEntry(existingEntry) || {
                    score: 0.5,
                    subject: req.session.subject ?? null,
                    chapter: req.session.currentChapter ?? null
                };
                const previousScore = getMasteryScore(normalizedEntry) ?? 0.5;
                const nextScore = roundScore(previousScore + masteryDelta) ?? previousScore;

                req.session.mastery[concept] = {
                    ...normalizedEntry,
                    score: nextScore
                };

                console.log(`${logPrefix} Previous mastery: ${Number(previousScore).toFixed(3)} | Mastery delta: ${Number(masteryDelta).toFixed(3)} | New mastery: ${Number(nextScore).toFixed(3)} | Concept: ${concept}`);
            }

            req.session.tier = calculateTier(req.session.mastery);
            req.session.masteryAnalytics = (req.session.mastery);
            req.session.questionCheckPending = false;
            req.session.questionChecked = true;

            console.log(`${logPrefix} Correct: ${Boolean(data.correct)}`);
            console.log(`${logPrefix} Question marked as checked`);

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

            req.session.lessonProgress.masteryGain = roundNumber(totalGain, 4) ?? totalGain;

            console.log(`${logPrefix} Mastery change: ${req.session.lessonProgress.masteryGain >= 0 ? "+" : ""}${Number(req.session.lessonProgress.masteryGain ?? 0).toFixed(2)}`);

            req.session.lessonProgress.questionsAsked++;

            const lessonFinished =
                req.session.lessonProgress.masteryGain >= 0.15 ||
                req.session.lessonProgress.questionsAsked >= 15;

            const completedMasteryGain = req.session.lessonProgress.masteryGain;
            const completedQuestionsAsked = req.session.lessonProgress.questionsAsked;

            let nextLesson = req.session.currentLesson ?? null;

            if (lessonFinished) {
                req.session.lessonHistory ??= [];
                await saveLessonHistory(
                    req,
                    req.session.currentLesson,
                    req.session.lessonProgress
                );

                req.session.lessonHistory = req.session.lessonHistory.slice(-20);

                nextLesson = await buildNextLesson({
                    mastery: req.session.mastery,
                    lessonHistory: req.session.lessonHistory,
                    grade: req.session.grade,
                    subject: req.session.subject || req.session.currentLesson?.subject || "maths",
                    currentLesson: req.session.currentLesson || null
                }, req);

                req.session.currentLesson = nextLesson;
                req.session.currentChapter = nextLesson.chapterKey ?? req.session.currentChapter ?? null;
                req.session.subject = nextLesson.subject || req.session.subject || "maths";
                req.session.lessonProgress = {
                    questionsAsked: 0,
                    masteryStart: structuredClone(req.session.mastery || {}),
                    masteryGain: 0
                };
            }

            res.status(200).json({
                data,
                lessonFinished,
                masteryGain: completedMasteryGain,
                questionsAsked: completedQuestionsAsked,
                nextLesson: lessonFinished ? nextLesson : null
            });
        } catch (err) {
            req.session.questionCheckPending = false;
            console.error(`${logPrefix} ${String(err)}`);
            return res.status(500).json({ status: "500 INTERNAL SERVER ERROR" });
        }
    });
}
