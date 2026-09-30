export default function registerQuestionRoute(router, helpers) {
    const {
        normalizeMastery,
        pickRandomChapter,
        loadChapterFromSession,
        filterChapterConcepts,
        genResponse,
        fixJson,
        safeParseJson,
        normalizeConceptList,
        normalizeConceptName
    } = helpers;
    const logPrefix = "[LEARN/QUESTION.JS]";

    router.get('/question', async (req, res) => {
        try {
            req.session.qno ??= 0;
            req.session.usedQuestions = Array.isArray(req.session.usedQuestions) ? req.session.usedQuestions : [];
            req.session.usedQuestionTypes = Array.isArray(req.session.usedQuestionTypes) ? req.session.usedQuestionTypes : [];
            req.session.mastery = normalizeMastery(req.session.mastery || {});
            req.session.correctAnswer = null;
            req.session.explanation = null;
            req.session.currentQuestionType = null;
            req.session.currentSubjective = true;
            const allQuestionTypes = ["mcq", "fillblanks", "truefalse", "matching", "ordering", "shortqa", "longqa"];
            const objectiveTypes = new Set(["mcq", "truefalse", "matching", "ordering"]);
            const activeLesson = req.session.currentLesson && typeof req.session.currentLesson === "object"
                ? req.session.currentLesson
                : null;

            const chapters = req.session.chsDone || [];

            if (!activeLesson) {
                return res.status(400).json({ error: "No active lesson" });
            }

            const lessonConcepts = activeLesson?.concepts
                ? normalizeConceptList(activeLesson.concepts)
                : [];

            console.log(`${logPrefix} Lesson concepts: ${JSON.stringify(lessonConcepts)}`);

            if (!lessonConcepts.length) {
                console.error(`${logPrefix} Lesson contains no concepts`);
                return res.status(400).json({
                    error: "Lesson contains no concepts"
                });
            }

            let chapterKey = activeLesson?.chapterKey
                ? String(activeLesson.chapterKey)
                : null;

            let lessonChapterLabel = activeLesson?.chapter || null;
            let lessonSubject = activeLesson?.subject || req.session.subject || "maths";

            if (!chapterKey) {
                chapterKey = req.session.currentChapter || null;
            }

            if (!chapterKey && chapters.length) {
                chapterKey = pickRandomChapter(chapters);
            }

            if (!chapterKey) {
                console.error(`${logPrefix} No chapters`);
                return res.status(400).json({
                    error: "No chapters"
                });
            }

            let syllabusText =
                await loadChapterFromSession(req, chapterKey);

            if (!syllabusText) {
                console.error(`${logPrefix} No syllabus`);
                return res.status(500).json({
                    status: 500,
                    error: "No syllabus"
                })
            }

            req.session.currentChapter = chapterKey;

            const filteredSyllabusText = filterChapterConcepts(
                syllabusText,
                lessonConcepts
            );

            console.log(`${logPrefix} Filtered syllabus concepts: ${JSON.stringify(Object.keys(filteredSyllabusText.concepts || {}))}`);

            if (!filteredSyllabusText || !filteredSyllabusText.concepts || Object.keys(filteredSyllabusText.concepts).length === 0) {
                console.error(`${logPrefix} No lesson concepts found in chapter`);
                return res.status(500).json({
                    error: "No lesson concepts found in chapter"
                });
            }

            req.session.mastery ??= {};
            req.session.qno++;

            const lessonConceptArray = lessonConcepts;

            const lessonConceptSet = new Set(
                lessonConceptArray.map((concept) => normalizeConceptName(concept))
            );

            const previousQuestionTypes = req.session.usedQuestionTypes
                .filter((type) => typeof type === "string" && type.trim())
                .slice(-5);
            const recentQuestionTypes = previousQuestionTypes.slice(-2);
            const blockedQuestionType = recentQuestionTypes.length === 2 && recentQuestionTypes[0] === recentQuestionTypes[1]
                ? recentQuestionTypes[0]
                : null;
            const allowedQuestionTypes = blockedQuestionType
                ? allQuestionTypes.filter((type) => type !== blockedQuestionType)
                : allQuestionTypes;

            console.log(`${logPrefix} Previous question types: ${JSON.stringify(previousQuestionTypes)}`);
            console.log(`${logPrefix} Allowed question types: ${JSON.stringify(allowedQuestionTypes)}`);

            const prompt = `
                You are EdVenture AI, an adaptive school tutor.

                Generate exactly ONE high-quality school-level question for the student's current lesson.

                The question must be clear, natural, age-appropriate, syllabus-aligned, text-only, and focused on the lesson concepts. Difficulty must come from reasoning, application, or conceptual depth—not confusing wording.

                Do not put praise, encouragement, emojis, or teacher commentary inside the question. Encouragement belongs only in the explanation.

                ==================================================
                STUDENT / LESSON
                ==================================================

                Subject: ${lessonSubject}
                Chapter: ${lessonChapterLabel || chapterKey}
                Lesson concepts: ${JSON.stringify(lessonConceptArray)}
                Lesson type: ${activeLesson?.lessonType || "practice"}
                Current tier: ${req.session.tier}

                Tier meanings:
                D = very easy: recall, definitions, identification, single-step questions
                C = easy-medium: simple application, one concept at a time
                B = standard: multi-step reasoning, normal school-level questions
                A = advanced: deeper reasoning, difficult applications, strong conceptual understanding

                Do NOT change the current tier.

                ==================================================
                STRICT SYLLABUS + CONCEPT RESTRICTION
                ==================================================

                Use ONLY information contained in the supplied syllabus.

                Do NOT use outside knowledge.

                The question must test ONLY the supplied lesson concepts:

                ${JSON.stringify(lessonConceptArray)}

                The chapter is context only. Do NOT test unrelated chapter concepts.

                The "concept" field MUST:
                - be an array;
                - contain only concepts from the lesson concept list;
                - use the exact concept spelling provided;
                - contain no synonyms or invented concepts;
                - accurately represent what the question tests.

                ==================================================
                MASTERY
                ==================================================

                Current mastery:
                ${JSON.stringify(req.session.mastery, null, 2)}

                Target mastery:
                ${JSON.stringify(activeLesson?.targetMastery || {}, null, 2)}

                Mastery scale:
                0.0 = not understood
                0.2 = very weak
                0.5 = developing
                0.7 = strong
                1.0 = mastered

                Prioritize concepts that are below their target mastery.

                If multiple concepts are below target:
                - Give most practice to concepts with greater need.
                - Do not distribute questions evenly just for balance.

                Concepts already at target are secondary reinforcement:
                - Use them occasionally.
                - Normally use at most 1–2 questions from mastered concepts in a lesson.
                - Never let a mastered concept replace substantial practice on an unmet concept.

                If only one concept is below target, keep almost all practice focused on it.

                Use mastery together with the current tier.

                ==================================================
                QUESTION CLARITY
                ==================================================

                Every question must:
                - be understandable on the first read;
                - use natural language appropriate for the student's grade;
                - ask one main thing unless multiple steps are genuinely necessary;
                - contain only relevant information;
                - avoid unnecessary jargon;
                - avoid trick wording unless the misconception is part of the lesson;
                - avoid excessive verbosity.

                Do NOT make questions difficult merely by making them confusing or wordy.

                Prefer a direct equation, sequence, example, or concrete situation when it tests the concept effectively.

                Before responding, silently rewrite the question if a student could reasonably misunderstand what is being asked.

                ==================================================
                TEXT-ONLY
                ==================================================

                EdVenture currently supports text-only questions.

                Do NOT require or reference:
                - diagrams
                - figures
                - graphs
                - tables
                - maps
                - pictures
                - clocks
                - number lines
                - visual components

                Do not say "look at the diagram", "see the graph", or similar.

                Every question must be completely answerable from text alone.

                ==================================================
                QUESTION TYPE
                ==================================================

                Allowed types:
                ${JSON.stringify(allowedQuestionTypes)}

                Previously used types:
                ${JSON.stringify(req.session.usedQuestionTypes?.slice(-5) || [])}

                Choose exactly ONE allowed type.

                Rules:
                - Do not use the same type more than twice consecutively.
                - If the previous two types are identical, choose a different type.
                - Do not force a fixed rotation.
                - Do not permanently favor any type.
                - Choose the type that best tests the selected concept.
                - Variety should be natural rather than mechanically rotated.

                Previous questions:
                ${req.session.usedQuestions.slice(-5).join("\n")}

                Do NOT repeat a previous question or create a trivial rewording.

                Avoid repeating:
                - wording
                - scenarios
                - unnecessary numbers
                - reasoning patterns
                - question structures

                Question number: ${req.session.qno}
                Random seed: ${Date.now() % 100000}

                ==================================================
                QUESTION TYPE SCHEMAS
                ==================================================

                MCQ:
                {
                    "question": "...",
                    "type": "mcq",
                    "options": ["...", "...", "...", "..."],
                    "correctAnswer": "...",
                    "explanation": "...",
                    "subjective": false,
                    "concept": ["..."]
                }

                Rules:
                - Exactly 4 unique options.
                - correctAnswer must exactly match one option.
                - Exactly one option is correct.

                FILL IN THE BLANKS:
                {
                    "question": "... ______ ...",
                    "type": "fillblanks",
                    "correctAnswer": "...",
                    "explanation": "...",
                    "subjective": true,
                    "concept": ["..."]
                }

                Rules:
                - The question MUST visibly contain a blank.
                - Use a blank such as "An angle measuring 90° is called a ______."
                - The answer should normally be 1–4 words.

                TRUE/FALSE:
                {
                    "question": "...",
                    "type": "truefalse",
                    "options": ["True", "False"],
                    "correctAnswer": "True",
                    "explanation": "...",
                    "subjective": false,
                    "concept": ["..."]
                }

                Rules:
                - The statement must be clearly true or false.
                - Avoid ambiguity.

                MATCHING:
                {
                    "question": "...",
                    "type": "matching",
                    "column1": ["...", "..."],
                    "column2": ["...", "..."],
                    "correctAnswer": [["...", "..."], ["...", "..."]],
                    "explanation": "...",
                    "subjective": false,
                    "concept": ["..."]
                }

                Rules:
                - At least 2 pairs.
                - column1 and column2 must have equal lengths.
                - column2 must be shuffled.
                - Every item must have exactly one logical match.
                - correctAnswer must contain the complete mapping.

                ORDERING:
                {
                    "question": "...",
                    "type": "ordering",
                    "options": ["...", "...", "..."],
                    "correctAnswer": ["...", "...", "..."],
                    "explanation": "...",
                    "subjective": false,
                    "concept": ["..."]
                }

                Rules:
                - At least 3 items.
                - options must be shuffled.
                - correctAnswer must contain the correct order.

                SHORT ANSWER:
                {
                    "question": "...",
                    "type": "shortqa",
                    "sampleAnswer": "...",
                    "wordLimit": number,
                    "explanation": "...",
                    "subjective": true,
                    "concept": ["..."]
                }

                Rules:
                - wordLimit = (grade <= 5) ? grade * 5 : grade * 10
                - Require a genuinely short constructed response.
                - Do not demand unnecessary explanation.

                LONG ANSWER:
                {
                    "question": "...",
                    "type": "longqa",
                    "sampleAnswer": "...",
                    "minWords": number,
                    "explanation": "...",
                    "subjective": true,
                    "concept": ["..."]
                }

                Rules:
                - minWords = the normal short-answer wordLimit.
                - The question must genuinely require a detailed response.
                - Do not turn a one-word/simple question into a long-answer question.

                FORBIDDEN FIELDS:
                - Include only fields required by the selected type.
                - Do not include null or undefined fields.
                - Do not include fields belonging to another question type.

                ==================================================
                EXPLANATION
                ==================================================

                The explanation is shown AFTER the student answers.

                Write it like a warm, natural teacher.

                It should:
                - acknowledge the student's result when appropriate;
                - briefly explain why the answer is correct;
                - use natural teacher language;
                - avoid sounding like a dictionary;
                - use emojis naturally when appropriate.

                Do NOT put encouragement inside the question.

                ==================================================
                SYLLABUS
                ==================================================

                ${JSON.stringify(filteredSyllabusText, null, 2)}

                ==================================================
                FINAL VALIDATION
                ==================================================

                Before responding, silently verify:

                1. The question uses ONLY the supplied syllabus.
                2. It tests ONLY the supplied lesson concepts.
                3. The concept array uses exact supplied concept names.
                4. The selected type is allowed.
                5. The type does not violate the consecutive-type rule.
                6. The question is not a repeat or trivial rewording.
                7. The question is completely text-only.
                8. The question is clear on the first read.
                9. The selected type's schema and constraints are satisfied.
                10. No forbidden fields are present.
                11. The explanation is appropriate and separate from the question.
                12. The result is exactly ONE valid JSON object.

                ==================================================
                OUTPUT
                ==================================================

                Return ONLY ONE valid JSON object.

                No markdown.
                No code fences.
                No explanation outside the JSON object.
            `;

            let data = null;
            let generationError = null;

            for (let attempt = 0; attempt < (blockedQuestionType ? 2 : 1); attempt++) {
                const retryNote = attempt === 0 || !blockedQuestionType
                    ? ""
                    : `\n\nTEMPORARY QUESTION-TYPE BALANCING:\nThe type ${JSON.stringify(blockedQuestionType)} is temporarily disallowed right now.\nChoose a different type from ${JSON.stringify(allowedQuestionTypes)}.\n`;
                const raw = await genResponse(prompt + retryNote);
                const cleanText = fixJson(raw);
                const parsed = safeParseJson(cleanText);

                if (
                    !parsed ||
                    typeof parsed !== "object" ||
                    Array.isArray(parsed) ||
                    typeof parsed.question !== "string" ||
                    typeof parsed.type !== "string" ||
                    !allQuestionTypes.includes(String(parsed.type)) ||
                    !normalizeConceptList(parsed.concept).length ||
                    (blockedQuestionType && String(parsed.type) === blockedQuestionType)
                ) {
                    generationError = new Error("Invalid question payload");
                    continue;
                }

                data = parsed;
                break;
            }

            if (!data) {
                console.error(`${logPrefix} Invalid question payload`);
                throw generationError ?? new Error("Invalid question payload");
            }

            const returnedConcepts = normalizeConceptList(data.concept);

            const generatedAnswer = data.correctAnswer ?? data.sampleAnswer ?? data.answer ?? null;

            console.log(`${logPrefix} Answer: ${JSON.stringify(generatedAnswer)}`);
            console.log(`${logPrefix} Subjective: ${req.session.currentSubjective}`);

            if (!returnedConcepts.every((concept) => lessonConceptSet.has(concept))) {
                console.error(`${logPrefix} Invalid lesson concept payload`);
                throw new Error("Invalid lesson concept payload");
            }

            const questionId = `${req.session.userId ?? "guest"}:${req.session.currentChapter ?? chapterKey}:${req.session.qno}:${Date.now()}`;

            req.session.currentQuestionId = questionId;
            req.session.questionChecked = false;
            req.session.questionCheckPending = false;

            console.log(`${logPrefix} AI selected type: ${String(data.type)}`);
            console.log(`${logPrefix} New question generated`);

            req.session.usedQuestions.push(data.question);
            req.session.usedQuestionTypes.push(data.type);
            req.session.usedQuestionTypes = req.session.usedQuestionTypes.slice(-10);
            req.session.correctAnswer = data.correctAnswer ?? null;
            req.session.explanation = data.explanation ?? null;
            req.session.currentQuestionType = data.type ?? null;
            req.session.currentSubjective = !objectiveTypes.has(String(data.type || ""));
            req.session.currentConcepts = returnedConcepts;

            res.status(200).json({
                ...data,
                questionId
            });
        } catch (err) {
            console.error(`${logPrefix} ${String(err)}`);
            res.status(500).json({ error: String(err) });
        }
    });
}
