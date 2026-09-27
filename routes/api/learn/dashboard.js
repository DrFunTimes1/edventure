export default function registerDashboardRoute(router, helpers){
    const {
        buildNextLesson,
        normalizeMastery,
        calculateTier,
    } = helpers;
    const logPrefix = "[LEARN/DASHBOARD.JS]";

    router.get('/next', async(req,res)=>{
        try {
            console.log(`${logPrefix} Next lesson requested.`);
            req.session.mastery =
                normalizeMastery(
                    req.session.mastery || {}
                );
            req.session.lessonHistory ??= [];

            const lesson = req.session.nextLesson || await buildNextLesson({
                mastery:req.session.mastery,
                lessonHistory:
                    req.session.lessonHistory,
                grade:
                    req.session.grade,
                subject:
                    req.session.subject || "maths",
                currentLesson:null
            },
            req
            );

            console.log(`${logPrefix} Next lesson prepared.`);
            req.session.nextLesson = lesson;
            res.json({
                lesson,
                lessonsDone:
                    req.session.lessonHistory.length,
                tier:
                    calculateTier(req.session.mastery)
            });
        }catch(err){
            console.error(`${logPrefix} ${String(err)}`);
            res.status(500).json({
                error:String(err)
            });
        }
    });
}