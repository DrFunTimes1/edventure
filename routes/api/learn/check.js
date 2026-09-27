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
            req.session.lessonFinished = false;
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

                console.log(
                    `${logPrefix} OBJECTIVE COMPARE | ` +
                    `type=${type} | ` +
                    `user=${JSON.stringify(answer)} | ` +
                    `expected=${JSON.stringify(expectedAnswer)} | ` +
                    `result=${compareObjectiveAnswer(answer, expectedAnswer, type)}`
                );

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

                    GRADING RULES:

                    - "correct" is a coarse indicator of whether the student's core understanding is correct; "score" is the detailed measure of how well they answered.
                    - "correct" does NOT mean the answer is perfect or complete.
                    - Use "score" as the actual measure of answer quality, correctness, completeness, clarity, and reasoning when reasoning is required.
                    - An answer may have "correct": true with a score below 1.0 when it is correct but incomplete, poorly explained, or less precise than an exemplary answer.
                    - An answer may have "correct": false while still receiving substantial partial credit when an important part is wrong but other parts demonstrate meaningful understanding.
                    - Never use "correct": false as a reason by itself to assign a very low score.
                    - Do not treat one wrong component as evidence that the entire answer demonstrates no understanding.
                    - Do not mark an answer incorrect merely because it is missing explanation, reasoning, working, or extra details.
                    - If the student's core answer is correct but requested reasoning or explanation is missing, mark it correct and reduce the score appropriately.
                    - Do not require the student to reproduce every detail from the reference material.
                    - Judge whether the student demonstrated the required understanding, not whether their answer matches an ideal answer word-for-word.
                    - Accept concise answers when the question only requires a concise answer.
                    - Do not penalize brevity when the question does not require explanation or reasoning.
                    - Do not reward verbosity merely because an answer is long.
                    - Judge the content and understanding, not the amount of text.

                    SCORE GUIDELINES:

                    - Exactly 1.0 is exceptional and uncommon. Use it only for an answer that is completely correct, complete, precise, clear, and exemplary, with excellent reasoning or explanation when required.
                    - A fully correct but ordinary answer should normally score roughly 0.8-0.95.
                    - A correct answer with minor omissions should normally score roughly 0.7-0.85.
                    - An answer that is mostly correct but is missing important reasoning should normally score roughly 0.5-0.75.
                    - A partially correct answer should normally score roughly 0.3-0.6.
                    - Mostly incorrect answers that show some relevant understanding should normally score roughly 0.1-0.3.
                    - Exactly 0.0 is exceptional and uncommon. Use it only for a completely irrelevant response, a complete misunderstanding with no meaningful evidence of understanding, an explicit refusal to answer, or an intentionally inappropriate response instead of an attempt.
                    - A normal mistake should not receive 0.0.
                    - If the student shows any meaningful understanding, the score should generally be greater than 0.
                    - These ranges are guidelines, not rigid formulas. Judge the actual answer.

                    MULTI-PART QUESTIONS:

                    - When the question asks for multiple things, evaluate each required part separately before assigning the overall score.
                    - Weight the required parts according to their importance.
                    - If two required parts are equally important and the student gets one correct and one incorrect, normally give meaningful partial credit around 0.5, adjusted for the quality of the reasoning and answer.
                    - Do not treat the entire answer as worthless because one component is wrong.
                    - If one part is completely correct and another part is completely wrong, the score should generally reflect that split rather than being near 0.
                    - If all parts are correct, the answer may receive a high score, but reserve 1.0 for exceptional, complete, precise, and exemplary work.
                    - If no part shows meaningful understanding, the score may be very low, but an attempted answer with relevant understanding should not be scored 0.0.

                    EXAMPLES OF THE INTENDED SCORING:

                    For a question asking:
                    "What is the mathematical name for this pattern, and what is the 7th term?"

                    - "geometric progression, 64"
                      Both required parts are correct. Give a very high score, potentially 1.0 if the answer is sufficiently complete, precise, and exemplary.

                    - "powers of 2, 64"
                      Both required parts are correct. Give a high score, but normally below 1.0 because the answer is concise and less textbook-like.

                    - "square numbers, 64"
                      The term is correct but the pattern classification is wrong. Give meaningful partial credit, around 0.5.

                    - "powers of 2, 128"
                      The pattern classification is correct but the term is wrong. Give meaningful partial credit, around 0.5.

                    - "square numbers, 5"
                      Both required parts are incorrect. Give a very low score unless the answer demonstrates some meaningful relevant understanding.

                    - "answer go brrrrrrrrrrrrrr"
                      Give 0.0 because there is no meaningful attempt.

                    - "fuck you"
                      Give 0.0 because it is an inappropriate response rather than an attempt to answer.

                    These examples demonstrate the grading philosophy. They are not rigid numerical formulas.

                    STYLE (MANDATORY):

                    - The explanation MUST sound like a real teacher talking to a student.
                    - Judge the answer relative to the actual question.
                    - If the question asks only for a final answer, a short correct answer can score highly.
                    - If the question asks for reasoning or explanation, missing that reasoning must lower the score.
                    - Do not automatically reward a short answer just because it is short.
                    - Do not automatically penalize a short answer when it sufficiently answers the question.
                    - If the answer is correct:
                        Start with encouragement such as:
                        "Great job!"
                        "Excellent work!"
                        "Nice thinking!"
                        "That's correct!"
                        Then briefly explain WHY the answer is correct.

                    - If the answer is partly correct:
                        First praise what was correct.
                        Then gently explain what was missing or incorrect.
                        Never sound critical or robotic.

                    - If the answer is incorrect:
                        Never simply state the correct answer.
                        Start with something encouraging like:
                        "Good try!"
                        "Nice attempt!"
                        "You're on the right track!"
                        "Don't worry—this one's a little tricky."
                        Then explain the idea clearly and kindly.

                    - Never sound like a textbook.
                    - Never write only a definition.
                    - Talk directly to the student using "you".
                    - Keep explanations under 60 words.
                    - Keep the explanation to one or two short sentences whenever possible.
                    - Accept alternative correct answers when they demonstrate the same understanding.
                    - If the answer is correct, give a brief positive note.
                    - If the answer is partly correct, clearly identify what is right and what is missing.
                    - If the answer is wrong, gently explain what is missing or what the student should reconsider.

                    META RESTRICTIONS:

                    - Use the syllabus only as background knowledge for judging the answer.
                    - Never mention the syllabus, reference material, prompt, instructions, grading criteria, AI, or internal reasoning in the explanation.
                    - Never say "the syllabus says", "the syllabus highlights", "according to the syllabus", or anything similar.
                    - Never say "according to the reference", "based on the provided material", or similar meta-commentary.
                    - Speak as though you already know the subject and are naturally responding to the student.

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

            //check if lesson is finished
            const targetMastery = req.session.currentLesson.targetMastery;

            req.session.lessonFinished = Object.keys(targetMastery).every((concept) => {
                const conceptMastery =
                    getMasteryScore(req.session.mastery[concept]) ?? 0.5;

                const target = Number(targetMastery[concept]);

                console.log(
                    `${logPrefix} Target check: ${concept} | ` +
                    `Mastery: ${conceptMastery.toFixed(3)} | ` +
                    `Target: ${target.toFixed(3)}`
                );

                return conceptMastery >= target;
            });

            const completedMasteryGain = req.session.lessonProgress.masteryGain;
            const completedQuestionsAsked = req.session.lessonProgress.questionsAsked;

            const lessonFinished = req.session.lessonFinished
            if (lessonFinished) {
                req.session.lessonHistory ??= [];
                await saveLessonHistory(
                    req,
                    req.session.currentLesson,
                    req.session.lessonProgress
                );

                req.session.lessonHistory = req.session.lessonHistory.slice(-20);
            }

            res.status(200).json({
                data,
                lessonFinished,
                masteryGain: completedMasteryGain,
                questionsAsked: completedQuestionsAsked,
                nextLesson: null
            });
        } catch (err) {
            req.session.questionCheckPending = false;
            console.error(`${logPrefix} ${String(err)}`);
            return res.status(500).json({ status: "500 INTERNAL SERVER ERROR" });
        }
    });
}
