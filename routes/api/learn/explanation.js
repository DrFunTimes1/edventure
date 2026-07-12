export default function registerExplanationRoute(router, helpers) {
    const {
        loadChapterFromSession,
        genResponse,
        fixJson
    } = helpers;

    router.post('/explanation', async (req, res) => {
        try {
            const { question, doubt } = req.body;

            const syllabusText = await loadChapterFromSession(req, req.session.currentChapter);

            const prompt = `
                Return ONLY JSON:
                {
                "answer": "..."
                }
                Question: ${question}
                Doubt: ${doubt}
                Syllabus: ${syllabusText}
            `;

            const raw = await genResponse(prompt);
            const cleanText = fixJson(raw);

            const data = JSON.parse(cleanText);

            res.json(data);

        } catch (err) {
            res.status(500).json({ error: String(err) });
        }
    });
}
