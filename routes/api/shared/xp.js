import { neon } from '@neondatabase/serverless';
const db = neon(process.env.DB_URL);

async function updateXp(req, level, xp) {
    try {
        await db`
                UPDATE users
                SET level = ${level}, xp = ${xp}
                WHERE id = ${req.session.userId}
            `;
    } catch (err) {
        throw new Error(err);
    }
}

function checkNextLevel(req, level, xp) {
    req.session.levelUp = false;
    req.session.levelUpRequirement = Math.floor(300 * Math.pow(level + 1, 1.5));
    while (xp >= req.session.levelUpRequirement) {
        level++;
        xp -= req.session.levelUpRequirement;
        req.session.levelUp = true;
        req.session.levelUpRequirement = Math.floor(300 * Math.pow(level + 1, 1.5));
    }
    req.session.xp = xp;
    req.session.level = level;
    return req.session.levelUp;
}

function calculateQuestXp(quest) {
    switch (quest.type) {
        case "ANSWER_QUESTIONS":
            return 50 * quest.params.questions;

        case "ACCURACY_LESSONS":
            return Math.floor(
                300 *
                quest.params.lessons *
                (quest.params.accuracy / 100)
            );

        case "COMPLETE_LESSONS":
            return 250 * quest.params.lessons;

        default:
            return 0;
    }
}

export {
    updateXp,
    checkNextLevel,
    calculateQuestXp
};