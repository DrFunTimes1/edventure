export default function registerQuestsRoute(router, helpers) {
    const {
        genResponse,
        safeParseJson,
        questProgress,
        validateQuest
    } = helpers;
    const logPrefix = "[QUESTS/QUESTS.JS]";

    router.post('/reset', (req, res) => {
        req.session.questsGenerated = false;
        req.session.result = null;
        req.session.rawResult = null;
        req.session.progress = null;

        return res.status(204).end();
    });

    router.post('/get', async (req, res) => {
        const QUEST_TYPES = {
            COMPLETE_LESSONS: ["lessons"],
            ACCURACY_LESSONS: ["lessons", "accuracy"],
            ANSWER_QUESTIONS: ["questions"],
            IMPROVE_MASTERY: ["mastery_increase"]
        };

        if (!req.session.questsGenerated) {
            const prompt = `
                Generate exactly 3 daily quests for a student.

                Allowed quest types ONLY:

                * COMPLETE_LESSONS
                * ACCURACY_LESSONS
                * ANSWER_QUESTIONS

                Return ONLY a valid JSON array.No markdown, no explanation, no extra text.

                Every quest MUST have exactly this structure:

                            {
                                "id": 1,
                                "type": "QUEST_TYPE",
                                "content": "Human-readable quest description.",
                                "params": { }
                            }

                Quest IDs:
                * The first quest MUST have "id": 1.
                * The second quest MUST have "id": 2.
                * The third quest MUST have "id": 3.
                * Each ID must be unique.
                * IDs must be integers, not strings.

                Allowed parameters:

                            COMPLETE_LESSONS:
                            {
                                "lessons": integer
                            }

                            ACCURACY_LESSONS:
                            {
                                "lessons": integer, (optional)
                                "accuracy": integer
                            }

                            ANSWER_QUESTIONS:
                            {
                                "questions": integer
                            }
                            Rules:

                * Make quests achievable within one day for a normal student.
                * Do not create absurdly difficult or trivial targets.
                * accuracy is a percentage from 1–100.
                * Use only the parameters appropriate for the selected quest type.
                * content MUST accurately describe the values in params.
                * Do not mention parameters, JSON, APIs, or implementation details in content.
                * Do not create quests involving subjects, chapters, concepts, streaks, time limits, or mechanics not listed above.
                * Make the three quests meaningfully different from each other.
                * Prefer natural, motivating wording rather than repetitive templates.
                * Do not use decimals for integer parameters.
                * Return exactly 3 quests.
            `;

            req.session.rawResult = await genResponse(prompt);
            req.session.result = safeParseJson(
                req.session.rawResult
                    .replace(/```json/g, "")
                    .replace(/```/g, "")
                    .trim()
            );
            console.log(logPrefix, req.session.result);

            if (!Array.isArray(req.session.result) || req.session.result.length !== 3 || !req.session.result.every(quest => validateQuest(quest, QUEST_TYPES))) {
                return res.status(500).json({
                    status: "500 Internal Server Error",
                    error: "AI returned invalid quests"
                });
            }

            req.session.questsGenerated = true;
            req.session.questsGeneratedDate = new Date().toISOString().split("T")[0];

            return res.status(201).json({
                status: "201 CREATED",
                quests: req.session.result
            })
        } else {
            req.session.progress = await Promise.all(req.session.result.map(quest => questProgress(quest, req)));
            return res.status(200).json({
                status: "200 OK",
                quests: req.session.result,
                progress: req.session.progress
            });
        }
    });
}