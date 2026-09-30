import { neon } from '@neondatabase/serverless';
const db = neon(process.env.DB_URL);

async function updateStreak(req) {
    const result = await db`
            SELECT id, start_date, end_date
            FROM streaks
            WHERE user_id = ${req.session.userId}
            ORDER BY start_date DESC
            LIMIT 1
        `;

    const streak = result[0];
    const today = new Date().toISOString().slice(0, 10);

    if (!req.session.streakToday) {
        if (!streak) {
            try {
                await db`
                        INSERT INTO streaks (user_id, start_date)
                        VALUES (${req.session.userId}, ${today})
                    `;
                req.session.lastStreakActivity = today;
                return {
                    content: "STARTED NEW STREAK",
                    continue: true
                }
            } catch {
                return {
                    status: "500 INTERNAL SERVER ERROR",
                    continue: false
                };
            }
        }

        try {
            await db`
                    UPDATE streaks
                    SET end_date = ${today}
                    WHERE user_id = ${req.session.userId}
                    AND end_date IS NULL
                `;
            return {
                content: "ENDED STREAK",
                continue: false
            }
        } catch {
            return {
                status: "500 INTERNAL SERVER ERROR",
                continue: false
            }
        }

    } else {
        req.session.lastStreakActivity = today;
        return {
            content: "CONTINUE STREAK",
            continue: true
        }
    }
}