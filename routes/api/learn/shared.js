import fs from "fs/promises";

export function createLearnHelpers({ ai, groq, db }) {
    async function loadChapter(filePath) {
        return await fs.readFile(filePath, "utf8");
    }

    function roundScore(score, precision = 4) {
        if (!Number.isFinite(score)) {
            return null;
        }

        const clamped = Math.max(0, Math.min(1, score));
        const factor = 10 ** precision;

        return Math.round((clamped + Number.EPSILON) * factor) / factor;
    }

    function normalizeConceptName(value) {
        const text = String(value ?? "").trim().replace(/\s+/g, " ");

        return text ? text.toLowerCase() : "";
    }

    function normalizeConceptList(value) {
        const items = Array.isArray(value) ? value : value == null ? [] : [value];
        const normalized = [];
        const seen = new Set();

        for (const item of items) {
            const concept = normalizeConceptName(item);

            if (!concept || seen.has(concept)) {
                continue;
            }

            seen.add(concept);
            normalized.push(concept);
        }

        return normalized;
    }

    function safeParseJson(value) {
        if (typeof value !== "string") {
            return value;
        }

        const trimmed = value.trim();

        if (!trimmed) {
            return null;
        }

        try {
            return JSON.parse(trimmed);
        } catch {
            return null;
        }
    }

    function normalizeMasteryEntry(entry) {
        if (typeof entry === "number" && Number.isFinite(entry)) {
            return {
                score: roundScore(entry),
                subject: null,
                chapter: null
            };
        }

        if (entry && typeof entry === "object") {
            const score = Number(entry.score);

            if (Number.isFinite(score)) {
                return {
                    score: roundScore(score),
                    subject: typeof entry.subject === "string" ? entry.subject.trim().toLowerCase() : entry.subject ?? null,
                    chapter: entry.chapter == null ? null : String(entry.chapter).trim()
                };
            }
        }

        return null;
    }

    function normalizeMastery(mastery) {
        const normalized = {};

        if (!mastery || typeof mastery !== "object") {
            return normalized;
        }

        for (const [concept, entry] of Object.entries(mastery)) {
            const normalizedEntry = normalizeMasteryEntry(entry);
            const normalizedConcept = normalizeConceptName(concept);

            if (!normalizedEntry || !normalizedConcept) {
                continue;
            }

            if (normalized[normalizedConcept]) {
                const previous = normalized[normalizedConcept];
                normalized[normalizedConcept] = {
                    score: roundScore(Math.max(previous.score ?? 0, normalizedEntry.score ?? 0)),
                    subject: previous.subject ?? normalizedEntry.subject ?? null,
                    chapter: previous.chapter ?? normalizedEntry.chapter ?? null
                };
            } else {
                normalized[normalizedConcept] = normalizedEntry;
            }
        }

        return normalized;
    }

    function getMasteryScore(entry) {
        if (typeof entry === "number" && Number.isFinite(entry)) {
            return entry;
        }

        if (entry && typeof entry === "object") {
            const score = Number(entry.score);
            return Number.isFinite(score) ? score : null;
        }

        return null;
    }

    function calculateTier(mastery) {
        const scores = Object.values(mastery)
            .map(getMasteryScore)
            .filter((score) => Number.isFinite(score));

        if (scores.length === 0) {
            return "C";
        }

        const avg = scores.reduce((sum, score) => sum + score, 0) / scores.length;

        if (avg <= 0.2) return "D";
        if (avg <= 0.5) return "C";
        if (avg <= 0.7) return "B";
        return "A";
    }

    function pickRandomChapter(chapters) {
        if (!Array.isArray(chapters) || chapters.length === 0) {
            return null;
        }

        const randomChapter = chapters[Math.floor(Math.random() * chapters.length)];
        return randomChapter == null ? null : String(randomChapter);
    }

    async function loadChapterFromSession(req, chapterKey) {
        const key = chapterKey == null ? null : String(chapterKey);

        if (!key) {
            return "";
        }

        req.session.chapterSummary ??= {};

        if (typeof req.session.chapterSummary[key] === "string") {
            return req.session.chapterSummary[key];
        }

        const filePath = `books/grade ${req.session.grade}/${req.session.subject}/${key}.txt`;

        try {
            const chapterText = await loadChapter(filePath);
            req.session.chapterSummary[key] = chapterText;
            return chapterText;
        } catch {
            req.session.chapterSummary[key] = "";
            return "";
        }
    }

    async function genQuestionGemini(prompt) {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
        });

        const text = typeof response.text === "function"
            ? response.text()
            : response.text;

        return text || "";
    }

    async function genQuestionGroq(prompt, temperature = 1, model) {
        const res = await groq.chat.completions.create({
            model,
            messages: [
                {
                    role: "system",
                    content: "Return ONLY valid JSON. No markdown. No explanation."
                },
                { role: "user", content: prompt }
            ],
            temperature,
            top_p: 0.95
        });

        return res.choices[0]?.message?.content || "";
    }

    async function genResponse(prompt) {
        try {
            return await genQuestionGemini(prompt);
        } catch {
            try {
                return await genQuestionGroq(prompt, 1, "qwen/qwen3-32b");
            } catch {
                return await genQuestionGroq(prompt, 1, "llama-3.3-70b-versatile");
            }
        }
    }

    function fixJson(jsonInp) {
        return jsonInp
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .replace(/^[^{]*/, "")
            .replace(/[^}]*$/, "")
            .trim();
    }

    function parsePossibleJson(value) {
        if (typeof value !== "string") {
            return value;
        }

        const trimmed = value.trim();

        if (!trimmed) {
            return trimmed;
        }

        try {
            return JSON.parse(trimmed);
        } catch {
            return trimmed;
        }
    }

    function normalizeObjectiveAnswer(value, type) {
        const parsed = safeParseJson(value);

        if (type === "matching") {
            const pairs = Array.isArray(parsed) ? parsed : [];

            return pairs
                .map((pair) => [
                    String(pair?.[0] ?? "").trim(),
                    String(pair?.[1] ?? "").trim()
                ])
                .sort((left, right) => {
                    const leftKey = `${left[0]}\u0000${left[1]}`;
                    const rightKey = `${right[0]}\u0000${right[1]}`;

                    return leftKey.localeCompare(rightKey);
                });
        }

        if (type === "ordering") {
            const items = Array.isArray(parsed) ? parsed : [];
            return items.map((item) => String(item).trim());
        }

        return String(parsed ?? "").trim();
    }

    function compareObjectiveAnswer(answer, correctAnswer, type) {
        if (type === "matching" || type === "ordering") {
            const normalizedAnswer = normalizeObjectiveAnswer(answer, type);
            const normalizedCorrect = normalizeObjectiveAnswer(correctAnswer, type);

            return JSON.stringify(normalizedAnswer) === JSON.stringify(normalizedCorrect);
        }

        return normalizeObjectiveAnswer(answer, type) === normalizeObjectiveAnswer(correctAnswer, type);
    }

    return {
        db,
        loadChapter,
        roundScore,
        normalizeConceptName,
        normalizeConceptList,
        safeParseJson,
        normalizeMasteryEntry,
        normalizeMastery,
        getMasteryScore,
        calculateTier,
        pickRandomChapter,
        loadChapterFromSession,
        genResponse,
        fixJson,
        compareObjectiveAnswer
    };
}
