import { neon } from '@neondatabase/serverless';
const db = neon(process.env.DB_URL);

async function lessonAchievement(req, lessons) {
    const result = await db`
            SELECT COUNT(*) AS count
            FROM lesson_history
            WHERE user_id = ${req.session.userId};
        `;

    return Number(result[0].count) >= lessons;
}

async function questionAchievement(req, questions) {
    const result = await db`
            SELECT questions_correct
            FROM lesson_history
            WHERE user_id = ${req.session.userId};
        `;
    const allQuestions = result.map(row => Number(row.questions_correct));

    let total = 0;
    allQuestions.forEach(questions => {
        total += questions
    });

    return total >= questions;
}

async function streakAchievement(req, days) {
    const result = await db`
            SELECT MAX(
                COALESCE(end_date, CURRENT_DATE) - start_date + 1
            ) AS longest_streak
            FROM streaks
            WHERE user_id = ${req.session.userId};
        `;

    const longestStreak = Number(result[0].longest_streak ?? 0);

    return longestStreak >= days;
}

async function masteryAchievement(req, mastery) {
    const result = await db`
            SELECT AVG((value->>'score')::numeric) AS total_mastery
            FROM progress,
                jsonb_each(data)
            WHERE user_id = ${req.session.userId};
        `;

    const totalMastery = Number(result[0].total_mastery ?? 0);
    return totalMastery * 100 >= mastery;
}

async function levelAchievement(req, levelRequired) {
    const result = await db`
            SELECT level
            FROM users
            WHERE id = ${req.session.userId}
        `;

    const level = result.map(row => Number(row.level));
    return level[0] >= levelRequired;
}

export {
    lessonAchievement,
    questionAchievement,
    streakAchievement,
    masteryAchievement,
    levelAchievement
};