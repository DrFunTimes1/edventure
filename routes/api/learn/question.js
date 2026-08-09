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

                Your job is to generate exactly ONE high-quality school-level question for the student's current lesson.

                Speak naturally like a good teacher writing a worksheet question.
                The QUESTION itself must be neutral and focused.
                Do NOT put praise, encouragement, emojis, or teacher commentary inside the question.
                Encouragement belongs in the explanation field.

                ==================================================
                STUDENT / LESSON
                ==================================================

                Subject:
                ${lessonSubject}

                Chapter:
                ${lessonChapterLabel || chapterKey}

                Lesson concepts:
                ${JSON.stringify(lessonConceptArray)}

                Lesson type:
                ${activeLesson?.lessonType || "practice"}

                Current tier:
                ${req.session.tier}

                Tier meanings:

                D = very easy
                - simple recall
                - definitions
                - basic identification
                - single-step questions

                C = easy-medium
                - simple application
                - one concept at a time

                B = standard school level
                - multi-step reasoning
                - normal NCERT / CBSE-style questions

                A = advanced school level
                - deeper reasoning
                - more difficult applications
                - stronger conceptual understanding

                DO NOT change the current tier.

                ==================================================
                STRICT SYLLABUS RESTRICTION
                ==================================================

                ONLY use information contained in the provided syllabus.

                Do NOT use outside knowledge.

                The question must test ONLY the lesson concepts:

                ${JSON.stringify(lessonConceptArray)}

                The chapter is context only.

                Do NOT test unrelated concepts from the chapter.

                The "concept" field MUST contain only concepts from the lesson concept list.

                Use the exact lesson concept spelling.

                ========================
                TEMPORARY QUESTION-TYPE BALANCING
                ========================

                Previous question types:
                ${JSON.stringify(previousQuestionTypes)}

                Allowed question types:
                ${JSON.stringify(allowedQuestionTypes)}

                RULE:
                - Choose exactly one type from the allowed question types list.
                - If the last two generated question types are the same, do not choose that type again.
                - Do not use a forced rotation pattern.
                - Pick the type that best fits the lesson concept.

                ==================================================
                TEXT-ONLY QUESTIONS
                ==================================================

                For now, EdVenture does NOT support diagrams or visual question components.

                Therefore:

                - Do NOT require diagrams.
                - Do NOT require figures.
                - Do NOT require graphs.
                - Do NOT require tables.
                - Do NOT require maps.
                - Do NOT require pictures.
                - Do NOT require clocks.
                - Do NOT require number lines.
                - Do NOT refer to a visual that does not exist.
                - Do NOT say "look at the diagram", "see the figure", "look at the graph", etc.
                - Do NOT require the frontend to draw anything.

                Every question must be completely answerable using text.

                If a concept normally uses a visual, rewrite the question as a text-only version that tests the same underlying concept.

                ==================================================
                MASTERY
                ==================================================

                Current mastery:

                ${JSON.stringify(req.session.mastery, null, 2)}

                Mastery scale:

                0.0 = not understood
                0.2 = very weak
                0.5 = developing
                0.7 = strong
                1.0 = mastered

                Question-selection priorities:

                1. Prefer concepts with low mastery.
                2. Give additional practice to concepts below 0.2.
                3. Avoid repeatedly testing concepts that are already strong.
                4. Occasionally review mastered concepts.
                5. Use mastery together with the current tier.
                6. If mastery information is missing, distribute practice naturally.
                7. The question must directly test one or more lesson concepts.

                ==================================================
                PREVIOUS QUESTIONS
                ==================================================

                Previously asked questions:

                ${req.session.usedQuestions.slice(-5).join("\n")}

                Do NOT repeat the same question.

                Do NOT create a trivial rewording of a previous question.

                Avoid repeating:

                - the same wording
                - the same scenario
                - the same numbers when unnecessary
                - the same reasoning pattern
                - the same question structure

                Random seed:
                ${Date.now() % 100000}

                Question number:
                ${req.session.qno}

                ==================================================
                QUESTION TYPE SELECTION
                ==================================================

                Available question types:

                1. mcq
                2. fillblanks
                3. truefalse
                4. matching
                5. ordering
                6. shortqa
                7. longqa

                Previously used question types:

                ${JSON.stringify(req.session.usedQuestionTypes?.slice(-5) || [])}

                For this version of EdVenture, use NATURAL question-type variety.

                Rules:

                - Do NOT use the same type more than 2 times consecutively.
                - If the previous 2 questions were the same type, choose a different type.
                - Do NOT permanently favor MCQ.
                - Do NOT permanently favor fillblanks.
                - Do NOT permanently favor subjective questions.
                - All seven types are valid choices.
                - Choose the type that best tests the selected concept.
                - Vary question types naturally across the lesson.
                - Do not force a rotation such as MCQ → fillblanks → truefalse.
                - Do not select a type merely because it is easy to generate.

                Previous question types are a constraint, NOT a fixed rotation.

                ==================================================
                QUESTION TYPE SPECIFICATIONS
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
                - Only one option should be correct.

                FORBIDDEN:
                column1
                column2
                wordLimit
                minWords

                --------------------------------------------------

                FILL IN THE BLANKS:

                {
                "question": "...",
                "type": "fillblanks",
                "correctAnswer": "...",
                "explanation": "...",
                "subjective": true,
                "concept": ["..."]
                }

                CRITICAL:
                The question MUST actually contain a blank.

                Use a visible blank such as:

                "An angle measuring 90° is called a ______."

                Do NOT ask a normal question while calling it fillblanks.

                The answer should normally be 1–4 words.

                FORBIDDEN:
                options
                column1
                column2
                wordLimit
                minWords

                --------------------------------------------------

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
                - Do not create ambiguous statements.

                --------------------------------------------------

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
                - column2 should be shuffled.
                - Every item must have exactly one logical match.
                - correctAnswer must contain the complete mapping.

                FORBIDDEN:
                options

                --------------------------------------------------

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
                - options must be presented in a shuffled order.
                - correctAnswer must contain the correct order.

                --------------------------------------------------

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

                wordLimit =
                (grade <= 5) ? grade * 5 : grade * 10

                The question should require a short constructed response.

                Do not ask for an unnecessarily long explanation.

                --------------------------------------------------

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

                minWords = the normal short-answer wordLimit.

                The question must genuinely require a more detailed response.

                Do not turn a simple one-word question into a long-answer question.

                ==================================================
                EXPLANATION STYLE
                ==================================================

                The explanation is written AFTER the student answers the question.

                It should sound like a real, warm teacher.

                Good:

                "Great job! 🎉 A right angle measures exactly 90°."

                Good:

                "You're close! A straight angle measures 180°, while a right angle measures 90°."

                Good:

                "Excellent! You correctly identified the pattern: each number increases by 3."

                Bad:

                "An obtuse angle is an angle whose measure is greater than 90° and less than 180°."

                The explanation should normally:

                - acknowledge the student's result when appropriate
                - be warm and encouraging
                - explain the answer briefly
                - use natural teacher language
                - avoid sounding like a dictionary definition
                - use emojis naturally when appropriate

                IMPORTANT:
                Do NOT put this encouragement in the question.

                BAD:

                "Great job! Let's explore this exciting number pattern! What comes next?"

                GOOD:

                "What is the next number in the sequence?"

                ==================================================
                CONCEPT OUTPUT
                ==================================================

                Every question MUST contain:

                "concept": ["concept name"]

                Use an array even when there is only one concept.

                Only use concepts from:

                ${JSON.stringify(lessonConceptArray)}

                Do NOT invent concepts.

                Do NOT create synonyms.

                The concept must represent what the question actually tests.

                ==================================================
                GLOBAL OUTPUT RULES
                ==================================================

                Return ONLY ONE valid JSON object.

                No markdown.

                No code fences.

                No text outside the JSON object.

                Do not include null fields.

                Do not include undefined fields.

                Do not include fields not required by the selected question type.

                The question must be:

                - school-level
                - age-appropriate
                - syllabus-aligned
                - text-only
                - clear
                - natural
                - unambiguous
                - focused on the lesson concepts

                ==================================================
                FINAL CHECK BEFORE RESPONDING
                ==================================================

                Before returning the JSON, silently verify:

                1. Is the question based ONLY on the supplied syllabus?
                2. Does it test ONLY the lesson concepts?
                3. Is the selected question type appropriate?
                4. Has the same type been used more than twice consecutively?
                5. If type = fillblanks, does the question ACTUALLY contain a blank?
                6. If type = mcq, are there exactly 4 unique options?
                7. If type = matching, are all pairs complete?
                8. If type = ordering, are there at least 3 items?
                9. If type = shortqa/longqa, are the required fields present?
                10. Does the question require no visual aid?
                11. Is the concept array valid?
                12. Is the output valid JSON?

                ==================================================
                SYLLABUS
                ==================================================

                ${JSON.stringify(filteredSyllabusText, null, 2)}

                ==================================================
                OUTPUT
                ==================================================

                Return exactly ONE valid JSON object.
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
