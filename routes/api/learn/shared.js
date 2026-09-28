import fs from "fs/promises";

export function createLearnHelpers({ ai, groq, db }) {
    const logPrefix = "[LEARN/SHARED.JS]";

    async function loadChapter(grade, subject, chapter) {
        const text = await fs.readFile(
            `books/grade ${grade}/${subject}/${chapter}.json`,
            "utf8"
        );

        return safeParseJson(text);
    }

    function roundScore(score, precision = 4) {
        if (!Number.isFinite(score)) {
            return null;
        }

        const rounded = roundNumber(score, precision);

        if (!Number.isFinite(rounded)) {
            return null;
        }

        return Math.max(0, Math.min(1, rounded));
    }

    function roundNumber(value, precision = 4) {
        if (!Number.isFinite(value)) {
            return null;
        }

        const factor = 10 ** precision;

        return Math.round((value + Number.EPSILON) * factor) / factor; //sometimes multiplication with decimals behaves really wierdly in js, so to make sure that doesn't happen, we use epsilon to nudge the number forward a lil bit
    }

    function normalizeConceptName(value) {
        const text = String(value ?? "").trim().replace(/\s+/g, " ");
        return text ? text.toLowerCase() : "";
    }

    function toTitleCase(value) {
        return String(value ?? "")
            .trim()
            .replace(/\s+/g, " ")
            .replace(/\b\w/g, (char) => char.toUpperCase());
    }

    async function getSubjectStats(nonNormalizedMastery = {}, req) {
        const mastery = normalizeMastery(nonNormalizedMastery);
        const subjects = {}

        for (const entry of Object.values(mastery)) {
            if (!entry?.subject) continue;

            const subject = entry.subject;
            const score = Number(entry.score);

            if (!Number.isFinite(score)) {
                continue;
            }

            if (!subjects[subject]) {
                subjects[subject] = {
                    total: 0,
                    count: 0
                };
            }

            subjects[subject].total += score;
            subjects[subject].count++;
        }

        const averages = {};
        for (const [subject, data] of Object.entries(subjects)) {
            averages[subject] = roundScore(data.total / data.count);
        }

        const lessonHistory = await loadLessonHistory(req);

        const prevLessons =
            lessonHistory
                .slice(-10)
                .map(lesson => lesson.subject)
                .filter(Boolean);

        return { averages, prevLessons };
    }

    async function buildNextLesson({
        mastery,
        grade,
        subject
    },
        req
    ) {
        console.log(`${logPrefix} Building next lesson`, {
            grade
        });

        const normalizedMastery = normalizeMastery(mastery || {});
        const subjectStats = await getSubjectStats(normalizedMastery, req);
        const lessonHistory = await loadLessonHistory(req);
        const preferredSubject = normalizeConceptName(subject);
        const {
            averages,
            prevLessons
        } = subjectStats;

        const chosenSubject = preferredSubject || normalizeConceptName((await chooseSubject(averages, prevLessons))?.subject) || "maths";
        console.log(`${logPrefix} Subject chosen: ${chosenSubject}`);

        const chapter =
            await chooseChapter({
                subject: chosenSubject,
                mastery: normalizedMastery,
                recentChapters:
                    lessonHistory
                        .filter(lesson => lesson.subject === chosenSubject)
                        .slice(-10)
                        .map(lesson => lesson.chapter_key),
                grade
            });

        console.log(`${logPrefix} Chapter chosen: ${chapter?.chapterKey ?? null}`);

        const chapterData =
            await loadChapter(
                grade,
                chosenSubject,
                chapter.chapterKey
            );

        const concepts =
            await chooseConcepts({
                chapter: chapterData,
                mastery: normalizedMastery,
                recentLessons:
                    lessonHistory.slice(-10)
            });

        console.log(`${logPrefix} Concepts chosen: ${JSON.stringify(concepts?.concepts ?? [])}`);
        console.log(`${logPrefix} Lesson type: ${concepts?.lessonType ?? null}`);
        console.log(`${logPrefix} Target mastery: ${concepts?.targetMastery ?? null}`);

        return {
            subject: chosenSubject,
            chapter: chapterData.chapter,
            chapterKey: chapter.chapterKey,
            concepts: concepts.concepts,
            lessonType: concepts.lessonType,
            targetMastery: concepts.targetMastery,
            maxQuestions: concepts.maxQuestions,
        };
    }

    function filterChapterConcepts(chapterData, lessonConcepts) {
        const chapterObject = chapterData && typeof chapterData === "object" && !Array.isArray(chapterData)
            ? chapterData
            : {};

        const lessonConceptSet = new Set(
            normalizeConceptList(lessonConcepts)
        );

        const filteredConcepts = {};

        for (const [conceptName, conceptValue] of Object.entries(chapterObject.concepts || {})) {
            if (lessonConceptSet.has(normalizeConceptName(conceptName))) {
                filteredConcepts[conceptName] = conceptValue;
            }
        }

        console.log(`${logPrefix} Filtered chapter concepts: ${JSON.stringify(Object.keys(filteredConcepts))}`);

        return {
            ...chapterObject,
            concepts: filteredConcepts
        };
    }

    async function chooseSubject(averages, prevLessons) {
        const prompt = `
            Choose the best subject to study next.

            Subject averages:
            ${JSON.stringify(averages, null, 2)}

            Recent subjects:
            ${JSON.stringify(prevLessons)}

            Rules:
            - Prefer weaker subjects.
            - Avoid repeating the same subject too often.
            - Occasionally revisit strong subjects.
            - Balance engagement and improvement.

            Return:

            {
                "subject": "..."
            }
        `;
        const raw = await genResponse(prompt);
        const clean = fixJson(raw);
        const subject = safeParseJson(clean);

        console.log(`${logPrefix} Subject chosen: ${subject?.subject ?? null}`);

        return subject;
    }

    async function chooseChapter({
        subject,
        mastery,
        recentChapters = [],
        grade
    }) {
        const chapters = await fs.readdir(
            `books/grade ${grade}/${subject}`
        );

        const chapterStats = {};

        for (const chapterFile of chapters) {
            const chapterKey = chapterFile.replace(".json", "");
            const chapterData = await loadChapter(
                grade,
                subject,
                chapterKey
            );

            const concepts = Object.keys(
                chapterData.concepts || {}
            );

            const scores = concepts
                .map(concept =>
                    mastery[normalizeConceptName(concept)]?.score
                )
                .filter(Number.isFinite);

            chapterStats[chapterKey] = {
                averageMastery:
                    scores.length
                        ? roundScore(
                            scores.reduce((a, b) => a + b, 0) / scores.length
                        )
                        : null
            };
        }

        const prompt = `
            You are selecting the next chapter.

            Subject:
            ${subject}

            Chapter data:
            ${JSON.stringify(chapterStats, null, 2)}

            Recent chapters:
            ${JSON.stringify(recentChapters, null, 2)}

            Rules:
            - Prefer weaker chapters.
            - Avoid repeating recent chapters.
            - Follow logical progression.
            - Revision is allowed if useful.

            Return ONLY JSON:

            {
                "chapterKey":""
            }
        `;

        const raw = await genResponse(prompt);
        const clean = fixJson(raw);
        const chapter = safeParseJson(clean);

        console.log(`${logPrefix} Chapter chosen: ${chapter?.chapterKey ?? null}`);

        return chapter;
    }

    async function chooseConcepts({
        chapter,
        mastery,
        recentLessons = []
    }) {
        const conceptData = {};

        for (const [concept, data] of Object.entries(
            chapter.concepts || {}
        )) {
            conceptData[concept] = {
                mastery: mastery[normalizeConceptName(concept)]?.score ?? null,
                subConcepts: Object.keys(data || {})
            };
        }

        const prompt = `
            You are composing a lesson.

            Concept data:
            ${JSON.stringify(conceptData, null, 2)}

            Recent lessons:
            ${JSON.stringify(recentLessons, null, 2)}

            Rules:

            - Prioritize weak concepts.
            - Include 2-4 concepts.
            - Avoid repeating the exact same lesson.
            - Sometimes include stronger concepts for confidence.
            - Follow natural prerequisite order.

            CONCEPT RULES (MANDATORY):

            - The concepts you return MUST be concepts that exist in the provided Concept data.
            - Return the EXACT same concept names as they appear in the Concept data.
            - Do NOT rename, reword, capitalize differently, shorten, expand, or otherwise modify concept names.
            - Do NOT invent new concepts.
            - Do NOT create concepts that are overly specific or describe a narrow subtype of a concept.
            - Prefer broad, reusable concepts over excessively specific concepts.
            - For example, use "angles" rather than "acute angles" when the broader concept "angles" exists.
            - The selected concepts should represent meaningful areas of understanding that can be assessed across multiple questions.

            TARGET MASTERY RULES (MANDATORY):

            - Provide a separate target mastery value for EVERY selected concept.
            - The keys in targetMastery MUST be the EXACT SAME concept names used in the concepts array.
            - Each target mastery value must be a number between 0 and 1.
            - A weaker concept may receive a higher target than a stronger concept.
            - Do not omit any selected concept from targetMastery.
            - Do not add any concept to targetMastery that is not in concepts.

            Return ONLY JSON:

            {
                "concepts": [
                    "exact concept name",
                    "exact concept name"
                ],
                "lessonType": "practice",
                "targetMastery": {
                    "exact concept name": 0.8,
                    "exact concept name": 0.75
                },
                "maxQuestions": 10
            }
        `;

        const raw = await genResponse(prompt);
        const result = safeParseJson(fixJson(raw));

        console.log(`${logPrefix} Concepts chosen: ${JSON.stringify(normalizeConceptList(result?.concepts).map(toTitleCase))}`);
        console.log(`${logPrefix} Lesson type: ${result?.lessonType || "practice"}`);
        console.log(`${logPrefix} Target mastery: ${Number(result?.targetMastery ?? 0.8)}`);

        return {
            concepts: normalizeConceptList(result?.concepts),
            lessonType: result?.lessonType || "practice",
            targetMastery: result?.targetMastery ?? {},
            maxQuestions: Number(result?.maxQuestions ?? 10),
        };
    }

    function normalizeConceptList(value) {
        const items = Array.isArray(value) ? value : (value == null ? [] : [value]);
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
        const key = String(chapterKey ?? "").trim();

        if (!key) {
            return null;
        }

        const subject =
            req.session.currentLesson?.subject
            || req.session.subject
            || "maths";

        const cacheKey =
            `${subject}:${key}`;

        req.session.chapterCache ??= {};

        if (req.session.chapterCache[cacheKey]) {
            return req.session.chapterCache[cacheKey];
        }

        try {
            const chapterData =
                await loadChapter(
                    req.session.grade,
                    subject,
                    key
                );

            req.session.chapterCache[cacheKey] =
                chapterData;

            return chapterData;
        }
        catch {
            req.session.chapterCache[cacheKey] = null;
            return null;
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
                try {
                    return await genQuestionGroq(prompt, 1, "qwen/qwen3.8-27b");
                } catch {
                    return await genQuestionGroq(prompt, 1, "qwen/qwen3.6-27b");
                }
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
        if (type === "matching" || type === "ordering") {
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

            const items = Array.isArray(parsed) ? parsed : [];
            return items.map((item) => String(item).trim());
        }

        // MCQ / truefalse
        return String(value ?? "").trim();
    } function normalizeObjectiveAnswer(value, type) {
        if (type === "matching" || type === "ordering") {
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

            const items = Array.isArray(parsed) ? parsed : [];
            return items.map((item) => String(item).trim());
        }

        // MCQ / truefalse
        return String(value ?? "").trim();
    }

    function compareObjectiveAnswer(answer, correctAnswer, type) {
        if (type === "matching" || type === "ordering") {
            const normalizedAnswer = normalizeObjectiveAnswer(answer, type);
            const normalizedCorrect = normalizeObjectiveAnswer(correctAnswer, type);

            return JSON.stringify(normalizedAnswer) === JSON.stringify(normalizedCorrect);
        }

        return normalizeObjectiveAnswer(answer, type) === normalizeObjectiveAnswer(correctAnswer, type);
    }

    async function saveLessonHistory(req, lesson, progress) {
        if (!req.session.userId) {
            return;
        }

        await db`
            INSERT INTO lesson_history
            (
                user_id,
                subject,
                chapter,
                chapter_key,
                concepts,
                accuracy,
                mastery_gain,
                questions_asked,
                lesson_type
            )
            VALUES
            (
                ${req.session.userId},
                ${lesson?.subject ?? null},
                ${lesson?.chapter ?? null},
                ${lesson?.chapterKey ?? null},
                ${JSON.stringify(lesson?.concepts ?? [])}::jsonb,
                ${progress.accuracy ?? null},
                ${progress.masteryGain ?? 0},
                ${progress.questionsAsked ?? 0},
                ${lesson?.lessonType ?? null}
            )
        `;
    }

    async function loadLessonHistory(req) {
        if (!req.session.userId) {
            return [];
        }
        const rows = await db`
            SELECT *
            FROM lesson_history
            WHERE user_id =
            ${req.session.userId}
            ORDER BY completed_at ASC
        `;
        return rows;
    }

    function getAcademicYear() {
        const now = new Date();
        return now.getMonth() >= 3
            ? now.getFullYear()
            : now.getFullYear() - 1;
    }

    async function loadStudentGrade(req) {
        const year = getAcademicYear();

        const rows = await db`
            SELECT grade, academic_year
            FROM users
            WHERE id=${req.session.userId}
            `;
        if (!rows.length) return null;

        let grade = rows[0].grade;

        if (rows[0].academic_year < year) {
            grade++;
            await db`
                UPDATE users
                SET
                    grade=${grade},
                    academic_year=${year}
                WHERE id=${req.session.userId}
            `;
        }
        req.session.grade = grade;
        return grade;
    }

    function validateQuest(quest, QUEST_TYPES) {
        if (!quest || typeof quest !== "object" || Array.isArray(quest)) {
            return false;
        }

        if (!quest.id || typeof quest.id !== "number") {
            return false;
        }

        if (!QUEST_TYPES[quest.type]) {
            return false;
        }

        if (typeof quest.content !== "string" || !quest.content.trim()) {
            return false;
        }

        if (!quest.params || typeof quest.params !== "object") {
            return false;
        }

        const allowedParams = QUEST_TYPES[quest.type];

        for (const key of allowedParams) {
            if (
                quest.params[key] !== undefined &&
                !Number.isInteger(quest.params[key])
            ) {
                return false;
            }
        }

        for (const key of Object.keys(quest.params)) {
            if (!allowedParams.includes(key)) {
                return false;
            }
        }

        return true;
    }

    async function questProgress(quest, req) {
        const params = quest.params;

        const lessonHistory = await db`
        SELECT *
        FROM lesson_history
        WHERE user_id = ${req.session.userId}
        AND completed_at::date = CURRENT_DATE
        ORDER BY completed_at ASC;
    `;

        const lessonsToday = lessonHistory.length;
        const result = {
            id: quest.id,
            completed: true,
            progress: {}
        };
        const paramKeys = Object.keys(params).filter((key) => params[key] !== undefined);

        if (params.lessons !== undefined && Number.isInteger(params.lessons)) {
            const total = params.lessons;
            const done = lessonsToday;

            result.progress.lessons = {
                total,
                done
            };

            result.completed &&= done >= total;
        }

        if (params.accuracy !== undefined && Number.isInteger(params.accuracy)) {
            const total = params.accuracy;

            const accuracyToday = lessonHistory.length
                ? lessonHistory.reduce(
                    (sum, lesson) => sum + Number(lesson.accuracy),
                    0
                ) / lessonHistory.length
                : 0;

            result.progress.accuracy = {
                total,
                done: accuracyToday
            };

            result.completed &&= accuracyToday >= total;
        }

        if (params.questions !== undefined && Number.isInteger(params.questions)) {
            const total = params.questions;

            const done = lessonHistory.reduce(
                (sum, lesson) => sum + Number(lesson.questions_asked),
                0
            );

            result.progress.questions = {
                total,
                done
            };

            result.completed &&= done >= total;
        }

        if (paramKeys.length === 1) {
            const [key] = paramKeys;
            result.total = result.progress[key]?.total;
            result.done = result.progress[key]?.done;
        }

        return result;
    }

    return {
        db,
        loadChapter,
        roundScore,
        normalizeConceptName,
        toTitleCase,
        getSubjectStats,
        buildNextLesson,
        normalizeConceptList,
        safeParseJson,
        normalizeMasteryEntry,
        normalizeMastery,
        getMasteryScore,
        calculateTier,
        pickRandomChapter,
        loadChapterFromSession,
        filterChapterConcepts,
        genResponse,
        fixJson,
        compareObjectiveAnswer,
        roundNumber,
        saveLessonHistory,
        loadLessonHistory,
        loadStudentGrade,
        chooseSubject,
        chooseChapter,
        chooseConcepts,
        validateQuest,
        questProgress
    };
}