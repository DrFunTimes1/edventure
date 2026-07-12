export default function registerQuestionRoute(router, helpers) {
    const {
        normalizeMastery,
        getMasteryScore,
        pickRandomChapter,
        loadChapterFromSession,
        genResponse,
        fixJson,
        safeParseJson,
        normalizeConceptList
    } = helpers;

    router.get('/question', async (req, res) => {
        try {
            req.session.qno ??= 0;
            req.session.usedQuestions ??= [];
            req.session.mastery = normalizeMastery(req.session.mastery || {});
            req.session.correctAnswer = null;
            req.session.explanation = null;
            req.session.currentQuestionType = null;
            req.session.currentSubjective = true;
            const objectiveTypes = new Set(["mcq", "truefalse", "matching", "ordering"]);

            const chapters = req.session.chsDone || [];
            if (!chapters.length) {
                return res.status(400).json({ error: "No chapters" });
            }

            const concepts = Object.entries(req.session.mastery)
                .map(([name, entry]) => ({
                    name,
                    score: getMasteryScore(entry)
                }))
                .filter((entry) => Number.isFinite(entry.score))
                .sort((a, b) => a.score - b.score);

            let targetConcept;

            if (concepts.length === 0) {
                targetConcept = "mixed practice";
            } else if (
                req.session.focusConcept &&
                req.session.focusStreak < req.session.maxFocusStreak
            ) {
                targetConcept = req.session.focusConcept;
                req.session.focusStreak++;
            } else {
                const weakestConcept = concepts[0];

                if (
                    weakestConcept.name === req.session.focusConcept &&
                    concepts.length > 1
                ) {
                    const easierPool = concepts.filter(
                        ({ name, score }) =>
                            name !== weakestConcept.name &&
                            score > weakestConcept.score + 0.1
                    );

                    targetConcept = easierPool[Math.floor(Math.random() * easierPool.length)]?.name ?? concepts[1].name;
                } else {
                    targetConcept = weakestConcept.name;
                }

                req.session.focusConcept = targetConcept;
                req.session.focusStreak = 1;
                req.session.maxFocusStreak = Math.floor(Math.random() * 3) + 1;
            }

            const targetEntry = req.session.mastery[targetConcept];
            const metadataChapter = targetEntry && typeof targetEntry === "object"
                ? targetEntry.chapter
                : null;

            let chapterKey = metadataChapter ? String(metadataChapter) : pickRandomChapter(chapters);

            if (!chapterKey) {
                return res.status(400).json({ error: "No chapters" });
            }

            let syllabusText = await loadChapterFromSession(req, chapterKey);

            if (!syllabusText) {
                const fallbackChapter = pickRandomChapter(
                    chapters.filter((chapter) => String(chapter) !== chapterKey)
                ) || pickRandomChapter(chapters);

                if (fallbackChapter) {
                    chapterKey = fallbackChapter;
                    syllabusText = await loadChapterFromSession(req, chapterKey);
                }
            }

            req.session.currentChapter = chapterKey;

            if (!syllabusText) {
                return res.status(500).json({ error: "Missing syllabus" });
            }

            req.session.mastery ??= {};
            req.session.qno++;

            const prompt = `
                You are EdVenture AI, an adaptive school tutor.

                Speak like a helpful, encouraging teacher.
                Keep the language clear, natural, and student-friendly.
                Avoid sounding overly rigid or formal.
                Explanations should be short, warm, and easy to follow.

                ========================
                ANTI-REPEAT SYSTEM
                ========================
                Random seed: ${Date.now() % 100000}
                Question index: ${req.session.qno}

                Previously asked questions (DO NOT REUSE CONCEPT OR FORMAT):
                ${req.session.usedQuestions.slice(-5).join("\n")}

                RULE:
                Do NOT reuse the same question structure, logic, or scenario even if numbers change.

                ========================
                SYLLABUS RESTRICTION
                ========================
                ONLY use the provided syllabus below.
                Do NOT use outside knowledge.
                Everything must remain strictly school-level and syllabus-aligned.

                ========================
                ADAPTIVE LEARNING SYSTEM
                ========================

                Current Tier:
                ${req.session.tier}

                Tier Meaning:

                D = very easy
                single-step recall
                definitions
                basic identification

                C = easy-medium
                simple application
                one concept at a time

                B = standard school level
                multi-step reasoning
                typical NCERT / CBSE style

                A = advanced school level
                deeper reasoning
                trickier applications
                higher conceptual understanding

                DO NOT change tier.

                ========================
                CONCEPT MASTERY
                ========================

                ${JSON.stringify(req.session.mastery, null, 2)}

                Mastery Scale:

                0.0 = not understood
                0.2 = weak
                0.5 = developing
                0.7 = strong
                1.0 = mastered

                Question Selection Rules:

                1. Prefer concepts below 0.5 mastery.
                2. Frequently practice concepts below 0.2 mastery.
                3. Occasionally review concepts above 0.7 mastery.
                4. Do not repeatedly ask the same concept.
                5. Use mastery information together with tier.
                6. Questions must stay inside the syllabus.
                7. Focus on learning gaps.
                8. Avoid over-practicing mastered concepts.
                9. If mastery data is empty, distribute questions evenly.
                10. Return ALL concepts tested.

                ========================
                CONCEPT OUTPUT RULE
                ========================

                EVERY question MUST contain:

                "concept": [
                    "concept1",
                    "concept2"
                ]

                Use an array even if only one concept exists.

                Examples:

                ["fractions"]
                ["adjectives"]
                ["photosynthesis","plant nutrition"]

                Use ONLY concepts explicitly named in the syllabus.
                Do NOT invent synonyms.
                If a concept already exists in mastery, reuse its exact spelling.
                If the syllabus contains narrower subtopics, label the question with the broader parent topic.
                Example: use "angles" instead of "right angle", "straight angle", or "obtuse angle".
                Prefer one clear concept label per question unless the question truly tests multiple distinct topics.

                ========================
                MASTERY-DRIVEN TARGET
                ========================

                Target Concept (IMPORTANT):
                ${targetConcept}

                RULE:
                - The question MUST test this concept.
                - If multiple concepts exist, include it in the "concept" array.
                - Do NOT ignore this.
                - Do NOT randomly switch topics.
                - Prefer broad topic names over narrow subtopic names.

                ========================
                ANTI-REPETITION
                ========================

                Do not repeatedly test
                the same concept,
                same wording,
                same scenario,
                same logic pattern,
                or same question structure.

                ========================
                QUESTION TYPES (STRICT)
                ========================

                1. MCQ
                - question
                - type: "mcq"
                - options: exactly 4 unique strings
                - correctAnswer: must match one option exactly
                - explanation
                - subjective: false
                - concept: the concept of the question, for example, ["fractions"], ["adjectives"], ["number line"]

                FORBIDDEN: column1, column2, wordLimit

                ------------------------

                2. FILL IN THE BLANKS
                - question
                - type: "fillblanks"
                - correctAnswer: 1–4 words max
                - subjective: true
                - concept: the concept of the question, for example, ["fractions"], ["adjectives"], ["number line"]

                FORBIDDEN: options, column1, column2

                ------------------------

                3. TRUE/FALSE
                - question
                - type: "truefalse"
                - options: ["True", "False"]
                - correctAnswer: "True" or "False"
                - explanation
                - subjective: false
                - concept: the concept of the question, for example, ["fractions"], ["adjectives"], ["number line"]

                ------------------------

                4. MATCHING
                - question
                - type: "matching"
                - column1
                - column2
                - correctAnswer: paired mapping of ALL items
                - explanation
                - subjective: false
                - concept: the concept of the question, for example, ["fractions"], ["adjectives"], ["number line"]

                RULES:
                - column1 and column2 must be same length (min 2)
                - column2 must be shuffled logically

                FORBIDDEN: options

                ------------------------

                5. ORDERING
                - question
                - type: "ordering"
                - options (shuffled list)
                - correctAnswer (correct order)
                - explanation
                - subjective: false
                - concept: the concept of the question, for example, ["fractions"], ["adjectives"], ["number line"]

                MINIMUM: 3 items

                ------------------------

                6. SHORT ANSWER
                - question
                - type: "shortqa"
                - sampleAnswer
                - wordLimit
                - subjective: true
                - concept: the concept of the question, for example, ["fractions"], ["adjectives"], ["number line"]

                RULE:
                wordLimit = (grade <= 5) ? grade * 5 : grade * 10

                ------------------------

                7. LONG ANSWER
                - question
                - type: "longqa"
                - sampleAnswer
                - minWords
                - subjective: true
                - concept: the concept of the question, for example, ["fractions"], ["adjectives"], ["number line"]

                RULE:
                minWords = shortqa wordLimit

                ========================
                GLOBAL RULES
                ========================
                - Only include required fields
                - Never include null or undefined
                - Never include markdown or code blocks
                - Output MUST be valid JSON
                - NO explanations outside JSON
                - Every question MUST include:
                "concept": ["..."]

                - Concept must represent the skill being tested
                - Can be 1 or multiple concepts
                - MUST match syllabus topics exactly
                - Keep wording simple, friendly, and age-appropriate
                - Prefer natural phrasing over stiff or robotic phrasing

                ========================
                ANTI-REPETITION RULES
                ========================
                - Vary question type, logic, and structure
                - Avoid repeating scenarios or patterns
                - Avoid similar reasoning structures
                - Avoid reusing same concept framing

                ========================
                SYLLABUS
                ========================
                ${syllabusText}

                ========================
                OUTPUT FORMAT
                ========================
                Return ONLY ONE valid JSON object.

                MANDATORY:
                - MUST include "concept"
                - MUST match Target Concept
            `;

            const raw = await genResponse(prompt);
            const cleanText = fixJson(raw);

            const data = safeParseJson(cleanText);

            if (
                !data ||
                typeof data !== "object" ||
                Array.isArray(data) ||
                typeof data.question !== "string" ||
                typeof data.type !== "string" ||
                !normalizeConceptList(data.concept).length
            ) {
                throw new Error("Invalid question payload");
            }

            req.session.usedQuestions.push(data.question);
            req.session.correctAnswer = data.correctAnswer ?? null;
            req.session.explanation = data.explanation ?? null;
            req.session.currentQuestionType = data.type ?? null;
            req.session.currentSubjective = !objectiveTypes.has(String(data.type || ""));
            req.session.currentConcepts = normalizeConceptList(data.concept);

            res.status(200).json(data);
        } catch (err) {
            res.status(500).json({ error: String(err) });
        }
    });
}
