export default function registerXpDebugRoute(router, helpers) {
    const {
        updateXp,
        checkNextLevel,
        calculateQuestXp
    } = helpers;
    const DEBUG_ENABLED = process.env.NODE_ENV !== "production";
    const logPrefix = "[LEARN/XP-DEBUG]";

    function state(req) {
        const level = Number(req.session.level);
        const xp = Number(req.session.xp);
        const xpRequired = Number(req.session.levelUpRequirement);
        const progress = xpRequired > 0 ? Math.max(0, Math.min(100, (xp / xpRequired) * 100)) : 0;

        return {
            level: Number.isFinite(level) ? level : null,
            xp: Number.isFinite(xp) ? xp : null,
            xpRequired: Number.isFinite(xpRequired) ? xpRequired : null,
            progress
        };
    }

    async function applyXp(req, amount) {
        const before = state(req);
        const xpDelta = Number(amount);

        if (!Number.isFinite(xpDelta) || xpDelta < 0) {
            throw new Error("XP amount must be a non-negative number");
        }

        const level = Number(req.session.level);
        const xp = Number(req.session.xp);
        req.session.xp = (Number.isFinite(xp) ? xp : 0) + xpDelta;
        const levelUp = checkNextLevel(req, Number.isFinite(level) ? level : 1, req.session.xp);
        await updateXp(req, req.session.level, req.session.xp);

        const after = state(req);
        console.log(`${logPrefix} XP operation`, {
            previousLevel: before.level,
            previousXp: before.xp,
            xpDelta,
            newLevel: after.level,
            newXp: after.xp,
            xpRequired: after.xpRequired,
            levelUp
        });

        return {
            ...after,
            previousLevel: before.level,
            previousXp: before.xp,
            xpDelta,
            levelUp
        };
    }

    router.post('/debug/xp', async (req, res) => {
        if (!DEBUG_ENABLED) {
            return res.status(404).json({ error: "Debug XP tools are disabled" });
        }

        if (!req.session.userId) {
            return res.status(401).json({ status: "401 UNAUTHORIZED" });
        }

        try {
            const action = String(req.body?.action || "state");
            const amount = Number(req.body?.amount);

            if (action === "state" || action === "refresh") {
                return res.status(200).json(state(req));
            }

            if (action === "add" || action === "test_level_up") {
                return res.status(200).json(await applyXp(req, amount));
            }

            if (action === "remove") {
                return res.status(400).json({
                    error: "Removing XP is unavailable because the existing progression logic does not support downward level changes."
                });
            }

            if (action === "set_xp") {
                const xp = Number(req.body?.xp);
                const current = state(req);

                if (!Number.isFinite(xp) || xp < 0 || xp >= current.xpRequired) {
                    return res.status(400).json({ error: "XP must be within the current level." });
                }

                req.session.xp = xp;
                await updateXp(req, req.session.level, req.session.xp);
                return res.status(200).json({
                    ...state(req),
                    previousLevel: current.level,
                    previousXp: current.xp,
                    xpDelta: xp - current.xp,
                    levelUp: false
                });
            }

            if (action === "set_level" || action === "set_state") {
                const before = state(req);
                const level = Number(req.body?.level);
                const xp = action === "set_state" ? Number(req.body?.xp) : Number(req.session.xp);

                if (!Number.isInteger(level) || level < 1 || !Number.isFinite(xp) || xp < 0) {
                    return res.status(400).json({ error: "Level and XP must be valid non-negative values." });
                }

                req.session.level = level;
                req.session.xp = xp;
                checkNextLevel(req, req.session.level, req.session.xp);
                await updateXp(req, req.session.level, req.session.xp);
                return res.status(200).json({
                    ...state(req),
                    previousLevel: before.level,
                    previousXp: before.xp,
                    xpDelta: 0,
                    levelUp: false
                });
            }

            if (action === "force_level_up" || action === "add_to_next_level") {
                const current = state(req);
                return res.status(200).json(await applyXp(req, Math.max(0, current.xpRequired - current.xp)));
            }

            if (action === "add_levels") {
                const levels = Number(req.body?.levels);
                const current = state(req);

                if (!Number.isInteger(levels) || levels < 1) {
                    return res.status(400).json({ error: "levels must be a positive integer" });
                }

                let result = current;
                for (let index = 0; index < levels; index++) {
                    result = await applyXp(req, Math.max(0, result.xpRequired - result.xp));
                }
                return res.status(200).json(result);
            }

            if (action === "test_lesson") {
                const accuracy = Number(req.body?.accuracy);
                const questions = Number(req.body?.questions);

                if (!Number.isFinite(accuracy) || accuracy < 0 || !Number.isFinite(questions) || questions < 0) {
                    return res.status(400).json({ error: "accuracy and questions must be non-negative numbers" });
                }

                return res.status(200).json(await applyXp(req, accuracy * 0.5 * questions));
            }

            if (action === "test_quest") {
                const quest = {
                    type: String(req.body?.type || ""),
                    params: req.body?.params || {}
                };
                const xp = calculateQuestXp(quest);
                return res.status(200).json(await applyXp(req, xp));
            }

            return res.status(400).json({ error: "Unknown XP debug action" });
        } catch (err) {
            console.error(`${logPrefix} ${String(err)}`);
            return res.status(400).json({ error: String(err.message || err) });
        }
    });
}
