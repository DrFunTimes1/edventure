export default function registerInitRoute(router, helpers) {
    const {
        db,
        loadChapter,
        normalizeMastery,
        calculateTier
    } = helpers;

    router.post('/init', async (req, res) => {
        try {
            const language = String(req.body.language || "").trim();
            const grade = Number(req.body.grade);
            const completedChapters = Array.isArray(req.body.completedChapters)
                ? req.body.completedChapters
                : [];
            const userId = req.session.userId || req.body.userId || null;

            if (!language || Number.isNaN(grade)) {
                return res.status(400).json({ error: "Invalid init data" });
            }

            req.session.subject = language;
            req.session.grade = grade;
            req.session.chsDone = completedChapters;

            if (userId) req.session.userId = userId;

            req.session.tier = "C";
            req.session.mastery = normalizeMastery(req.session.mastery || {});
            req.session.qno = 0;
            req.session.usedQuestions = [];
            req.session.chapterSummary = {};

            req.session.focusConcept = null;
            req.session.focusStreak = 0;
            req.session.maxFocusStreak = Math.floor(Math.random() * 3) + 1;
            req.session.cooldownConcept = null;

            for (const ch of req.session.chsDone) {
                const chapterKey = String(ch);
                const filePath = `books/grade ${req.session.grade}/${req.session.subject}/${chapterKey}.txt`;

                try {
                    req.session.chapterSummary[chapterKey] = await loadChapter(filePath);
                } catch {
                    req.session.chapterSummary[chapterKey] = "";
                }
            }

            if (req.session.userId) {
                await db`
                    INSERT INTO progress (user_id, data)
                    VALUES (${req.session.userId}, '{}'::jsonb)
                    ON CONFLICT (user_id)
                    DO NOTHING
                `;
                const progress = await db`
                    SELECT data
                    FROM progress
                    WHERE user_id = ${req.session.userId}
                `;

                if (progress.length > 0) {
                    const storedMastery = progress[0].data || {};
                    const normalizedMastery = normalizeMastery(storedMastery);
                    req.session.mastery = normalizedMastery;

                    if (JSON.stringify(normalizedMastery) !== JSON.stringify(storedMastery)) {
                        await db`
                            UPDATE progress
                            SET data = ${JSON.stringify(normalizedMastery)}::jsonb
                            WHERE user_id = ${req.session.userId}
                        `;
                    }
                }

                req.session.lessonProgress = {
                    questionsAsked: 0,
                    masteryStart: structuredClone(req.session.mastery || {}),
                    masteryGain: 0
                };

                req.session.tier = calculateTier(req.session.mastery);
            }

            res.json({ status: "ok" });
        } catch {
            return res.status(500).json({ status: "500 INTERNAL SERVER ERROR" });
        }
    });
}
