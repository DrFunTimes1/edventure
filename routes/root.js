import express from 'express';

export default function registerRootRoute(db) {
    const router = express.Router();

    function checkStreak(req) {
        const last = req.session.lastStreakActivity;

        if (!last) {
            return null;
        }

        return Date.now() - last < 24 * 60 * 60 * 1000;
    }

    router.get('/', (req, res) => {
        res.sendStatus(200);
    });

    router.post('/api/session/open', async (req, res) => {
        try {
            if (req.session.userId) {
                const result = await db`
                    SELECT level, xp
                    FROM users
                    WHERE id = ${req.session.userId}
                `;

                const user = result[0];
                req.session.level = user?.level ?? null;
                req.session.xp = user?.xp ?? null;
            }

            req.session.streakToday ??= false;
            req.session.lastStreakActivity ??= null;

            req.session.streakToday = checkStreak(req);

            const today = new Date().toISOString().slice(0, 10);

            if (req.session.questsGeneratedDate !== today) {
                req.session.questsGenerated = false;
                req.session.questsGeneratedDate = today;
            }

            res.status(204).end();
        } catch (err) {
            console.error("[SESSION/OPEN]", err);
            res.status(500).json({ error: "Failed to initialize session" });
        }
    });

    return router;
}