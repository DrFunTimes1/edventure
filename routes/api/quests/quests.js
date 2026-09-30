import express from "express";
import { db } from "../shared/db.js";
const router = express.Router();
import {
    genResponse,
    safeParseJson
} from "../shared/ai.js";

import {
    questProgress,
    validateQuest
} from "../shared/quests.js";

import {
    calculateQuestXp,
    updateXp,
    checkNextLevel
} from "../shared/xp.js";
const logPrefix = "[QUESTS/QUESTS.JS]";
const DEBUG_ENABLED = process.env.NODE_ENV !== "production";

router.post('/debug/complete/:id', async (req, res) => {
    if (!DEBUG_ENABLED) {
        return res.status(404).json({ error: "Quest debug tools are disabled" });
    }

    if (!req.session.userId) {
        return res.status(401).json({ status: "401 UNAUTHORIZED" });
    }

    try {
        const id = Number(req.params.id);
        const quest = req.session.result?.find((item) => item.id === id);
        const params = quest?.params || {};
        const supportedParams = new Set(["lessons", "questions", "accuracy"]);
        const unknownParams = Object.keys(params).filter((key) => !supportedParams.has(key));

        if (!quest) {
            return res.status(404).json({ error: "Quest not found" });
        }

        if (unknownParams.length) {
            return res.status(400).json({
                error: `Quest debug completion does not support: ${unknownParams.join(", ")}`
            });
        }

        const history = await db`
                SELECT accuracy, questions_asked
                FROM lesson_history
                WHERE user_id = ${req.session.userId}
                AND completed_at::date = CURRENT_DATE
            `;
        const lessonTarget = Number.isInteger(params.lessons) ? params.lessons : 0;
        const questionTarget = Number.isInteger(params.questions) ? params.questions : 0;
        const accuracyTarget = Number.isInteger(params.accuracy) ? params.accuracy : null;
        const lessonsDone = history.length;
        const questionsDone = history.reduce((sum, lesson) => sum + Number(lesson.questions_asked || 0), 0);
        const accuracyTotal = history.reduce((sum, lesson) => sum + Number(lesson.accuracy || 0), 0);

        if (accuracyTarget === 100 && history.some((lesson) => Number(lesson.accuracy || 0) < 100)) {
            return res.status(400).json({
                error: "Cannot prepare 100% accuracy while today's existing lesson history is below 100%."
            });
        }

        const accuracyRows = accuracyTarget == null || accuracyTarget >= 100
            ? 0
            : Math.max(0, Math.ceil((accuracyTarget * lessonsDone - accuracyTotal) / (100 - accuracyTarget)));
        const rowsToInsert = Math.max(
            lessonTarget - lessonsDone,
            accuracyRows,
            accuracyTarget != null && lessonsDone === 0 ? 1 : 0
        );
        const questionsToInsert = Math.max(0, questionTarget - questionsDone);

        for (let index = 0; index < rowsToInsert; index++) {
            await db`
                    INSERT INTO lesson_history (user_id, accuracy, questions_asked)
                    VALUES (${req.session.userId}, ${accuracyTarget == null ? null : 100}, ${index === 0 ? questionsToInsert : 0})
                `;
        }

        if (rowsToInsert === 0 && questionsToInsert > 0) {
            await db`
                    INSERT INTO lesson_history (user_id, accuracy, questions_asked)
                    VALUES (${req.session.userId}, ${accuracyTarget == null ? null : 100}, ${questionsToInsert})
                `;
        }

        console.log(`${logPrefix} Debug completion prepared`, {
            id,
            insertedLessons: rowsToInsert,
            insertedQuestions: questionsToInsert,
            params
        });

        return res.status(204).end();
    } catch (err) {
        console.error(`${logPrefix} Debug completion failed: ${String(err)}`);
        return res.status(500).json({ error: "Failed to prepare quest completion" });
    }
});

router.post('/reset', (req, res) => {
    req.session.questsGenerated = false;
    req.session.result = null;
    req.session.rawResult = null;
    req.session.progress = null;
    req.session.claimed = [];

    return res.status(204).end();
});

router.post('/', async (req, res) => {
    const QUEST_TYPES = {
        COMPLETE_LESSONS: ["lessons"],
        ACCURACY_LESSONS: ["lessons", "accuracy"],
        ANSWER_QUESTIONS: ["questions"]
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

router.post('/:id/claim', async (req, res) => {
    req.session.claimed ??= [];
    const id = Number(req.params.id);

    const quest = req.session.result?.find(
        quest => quest.id === id
    );

    if (!quest) {
        return res.status(404).json({
            error: "Quest not found"
        });
    }

    const progress = await questProgress(quest, req);

    if (!progress.completed) {
        return res.status(400).json({
            error: "Quest is not completed"
        });
    }

    if (!req.session.claimed[id]) {
        const xp = calculateQuestXp(quest);
        req.session.xp += xp;
        const levelUp = checkNextLevel(req, req.session.level, req.session.xp);

        req.session.claimed[id] = true

        await updateXp(req, req.session.level, req.session.xp)

        res.status(200).json({
            status: "200 OK",
            claim: true,
            xp,
            levelUp,
            level: req.session.level,
            currentXp: req.session.xp,
            xpRequired: req.session.levelUpRequirement

        })
    } else {
        return res.status(409).json({
            status: "409 CONFLICT",
            error: "QUEST ALREADY CLAIMED",
            claim: false
        })
    }
});
export default router;