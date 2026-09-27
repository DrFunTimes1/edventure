export default function registerInitRoute(router, helpers) {
    const {
        db,
        normalizeMastery,
        calculateTier,
        loadLessonHistory,
        loadStudentGrade,
        buildNextLesson
    } = helpers;
    const logPrefix = "[LEARN/INIT.JS]";

    async function loadStoredMastery(req) {
        if (!req.session.userId) {
            req.session.mastery =
                normalizeMastery(req.session.mastery || {});
            return req.session.mastery;
        }

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
            req.session.mastery =
                normalizeMastery(progress[0].data || {});
        }
        else {
            req.session.mastery =
                normalizeMastery({});
        }

        return req.session.mastery;
    }

    router.post('/init', async (req, res) => {
        try {
            console.log(`${logPrefix} User started lesson`);

            const grade = await loadStudentGrade(req);

            if (!grade) {
                console.error(`${logPrefix} Grade not found`);
                return res.status(400).json({
                    error: "Grade not found"
                });
            }

            if (Number.isNaN(grade)) {
                console.error(`${logPrefix} Invalid grade`);
                return res.status(400).json({
                    error: "Invalid grade"
                });
            }
            req.session.grade = grade;
            console.log(`${logPrefix} Grade: ${grade}`);
            const subject = req.body.language
                ? String(req.body.language).trim().toLowerCase()
                : String(req.session.subject || "maths").trim().toLowerCase();

            req.session.subject = subject || "maths";

            console.log(`${logPrefix} Subject: ${req.session.subject}`);

            await loadStoredMastery(req);

            req.session.lessonHistory = await loadLessonHistory(req);
            req.session.tier = calculateTier(req.session.mastery);

            const currentLesson =
                req.session.nextLesson ??
                await buildNextLesson(
                    {
                        mastery: req.session.mastery,
                        grade,
                        subject: req.session.subject
                    },
                    req
                );

            req.session.currentLesson = currentLesson;
            delete req.session.nextLesson;
            req.session.currentChapter = currentLesson.chapterKey ?? null;
            req.session.lessonProgress = {
                questionsAsked: 0,
                masteryStart: structuredClone(req.session.mastery || {}),
                masteryGain: 0
            };
            console.log(`${logPrefix} Current lesson: ${JSON.stringify({
                subject: currentLesson?.subject ?? null,
                chapter: currentLesson?.chapter ?? null,
                chapterKey: currentLesson?.chapterKey ?? null,
                concepts: currentLesson?.concepts ?? [],
                lessonType: currentLesson?.lessonType ?? null,
                targetMastery: currentLesson?.targetMastery ?? {},
                maxQuestions: currentLesson?.maxQuestions ?? null
            })}`);

            res.json({
                status: "ok",
                grade,
                tier: req.session.tier,
                lessonsDone: req.session.lessonHistory.length,
                currentLesson
            });
        } catch (err) {
            res.status(500).json({
                error: String(err)
            });
        }
    });

    router.get('/status', async (req, res) => {
        try {
            if (!req.session.userId) {
                return res.status(401).json({
                    error: "Unauthorized"
                });
            }

            if (!req.session.grade) req.session.grade = await loadStudentGrade(req);

            await loadStoredMastery(req);
            req.session.lessonHistory ??= [];

            res.json({
                loggedin: true,
                grade: req.session.grade ?? null,
                tier: calculateTier(req.session.mastery),
                mastery: req.session.mastery ?? {},
                lessonHistoryCount: req.session.lessonHistory.length,
                currentLesson: req.session.currentLesson ?? null,
                name: req.session.userName ?? null
            });
        } catch (err) {
            console.error(`${logPrefix} ${String(err)}`);
            res.status(500).json({
                error: String(err)
            });
        }
    });
}