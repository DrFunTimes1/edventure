import { neon } from '@neondatabase/serverless';
const db = neon(process.env.DB_URL);

function validateQuest(quest, QUEST_TYPES) {
    if (!quest || typeof quest !== "object" || Array.isArray(quest)) {
        return false;
    }

    if (!quest.id || typeof quest.id !== "number") {
        return false;
    }

    if (!QUEST_TYPES[quest.type]) {
        return false;
    }

    if (typeof quest.content !== "string" || !quest.content.trim()) {
        return false;
    }

    if (!quest.params || typeof quest.params !== "object") {
        return false;
    }

    const allowedParams = QUEST_TYPES[quest.type];

    for (const key of allowedParams) {
        if (
            quest.params[key] !== undefined &&
            !Number.isInteger(quest.params[key])
        ) {
            return false;
        }
    }

    for (const key of Object.keys(quest.params)) {
        if (!allowedParams.includes(key)) {
            return false;
        }
    }

    return true;
}

async function questProgress(quest, req) {
    const params = quest.params;

    const lessonHistory = await db`
        SELECT *
        FROM lesson_history
        WHERE user_id = ${req.session.userId}
        AND completed_at::date = CURRENT_DATE
        ORDER BY completed_at ASC;
    `;

    const lessonsToday = lessonHistory.length;
    const result = {
        id: quest.id,
        completed: true,
        progress: {}
    };
    const paramKeys = Object.keys(params).filter((key) => params[key] !== undefined);

    if (params.lessons !== undefined && Number.isInteger(params.lessons)) {
        const total = params.lessons;
        const done = lessonsToday;

        result.progress.lessons = {
            total,
            done
        };
        result.completed &&= done >= total;
    }

    if (params.accuracy !== undefined && Number.isInteger(params.accuracy)) {
        const total = params.accuracy;

        const accuracyToday = lessonHistory.length
            ? lessonHistory.reduce(
                (sum, lesson) => sum + Number(lesson.accuracy),
                0
            ) / lessonHistory.length
            : 0;

        result.progress.accuracy = {
            total,
            done: accuracyToday
        };

        result.completed &&= accuracyToday >= total;
    }

    if (params.questions !== undefined && Number.isInteger(params.questions)) {
        const total = params.questions;

        const done = lessonHistory.reduce(
            (sum, lesson) => sum + Number(lesson.questions_asked),
            0
        );

        result.progress.questions = {
            total,
            done
        };

        result.completed &&= done >= total;
    }

    if (paramKeys.length === 1) {
        const [key] = paramKeys;
        result.total = result.progress[key]?.total;
        result.done = result.progress[key]?.done;
    }

    return result;
}