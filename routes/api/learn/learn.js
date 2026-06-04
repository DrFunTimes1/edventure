//most of this is copied from question.js because they basically do the same thing but different
import express from 'express';
import session from "express-session";
import cors from 'cors';
import 'dotenv/config';
import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import fs from "fs/promises";

const ai = new GoogleGenAI({});
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const router = express.Router();

router.use(session({
    secret: "edventure-secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

router.use(express.json());
router.use(cors());

async function loadChapter(filePath) {
    return await fs.readFile(filePath, "utf8");
}

router.post('/init', async (req, res) => {
    try {
        req.session.subject = req.body.language;
        req.session.grade = req.body.grade;
        req.session.chsDone = req.body.completedChapters || [];

        // reset stuff
        req.session.level = 0;
        req.session.qno = 0;
        req.session.chapterIndex = 0;
        req.session.usedQuestions = [];
        req.session.explanations = {};

        // caches
        req.session.chapterCache = {};
        req.session.chapterSummary = {};

        for (let ch of req.session.chsDone) {
            const filePath = `books/grade ${req.session.grade}/${req.session.subject}/${ch}.txt`;
            try{
                req.session.chapterSummary[String(ch)] = await loadChapter(filePath);
            } catch (err) {
                console.error("Chapter load failed:", filePath, err);
                req.session.chapterCache[String(ch)] = "";
                req.session.chapterSummary[String(ch)] = "";
            }
        }

        res.status(200).json({ status: "200 OK" });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "init failed" });
    }
});

async function genQuestionGemini(prompt) {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
        });

        const text = typeof response.text === "function" ? response.text() : response.text;

        console.log("response generated");
        return (text || response.candidates?.[0]?.content?.parts?.[0]?.text || "");

    } catch (err) {
        console.error("Gemini Failed", err);
        throw err;
    }
}
async function genQuestionGroq(prompt, temperature = 1, model) {
    try {
        const res = await groq.chat.completions.create({
            // model: "llama-3.3-70b-versatile",
            model: model,
            // model: "llama-3.1-8b-instant",
            messages: [
                {
                    role: "system",
                    content:
                        `You are a strict JSON generator.

                        RULES:
                        - Output ONLY valid JSON
                        - No markdown
                        - No explanation
                        - No extra text
                        - If you fail, return empty JSON: {}`
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: temperature,
            top_p: 0.95
        });

        return res.choices[0]?.message?.content || "";
    } catch (err) {
        console.error("Groq error:", err);
        throw err;
    }
}
async function genResponse(prompt) {
    try {
        return await genQuestionGemini(prompt);
    } catch (e) {
        console.error("failed to use gemini, using groq instead. Actual error: ", e);
        try{
            return await genQuestionGroq(prompt, 1, "qwen/qwen3-32b");
        } catch (e) {
            try{
                return await genQuestionGroq(prompt, 1, "llama-3.3-70b-versatile");
            }
            catch (e){
                try{
                    return await genQuestionGroq(prompt, 1, "openai/gpt-oss-120b")
                } catch (e){
                    console.error(`ALL ais failed with error ${e}`);
                    throw e;
                }
            }
        }
    }
}
async function fixJson(jsonInp) {
    let cleanText = jsonInp
            .replace(/```json/g, "") //replace all matches of that (/g means global) with ""
            .replace(/```/g, "") //same thing as above
            .replace(/^[^{]*/, "") // remove junk before {
            .replace(/[^}]*$/, "") // remove junk after }
            .trim(); //remove trailing tabs/spaces etc.
    return cleanText;
}

router.get('/question', async (req, res) => {
    try {
        // check null/undefined
        req.session.level ??= 0; // I found this really cool thing, ??= means assign value to variable if variable = null/undefined
        req.session.qno ??= 0;
        req.session.usedQuestions ??= [];
        req.session.chapterIndex ??= 0;

        const chapters = req.session.chsDone || [];

        //No chapters? If this ever happens, the program is C O O K E D.
        if (chapters.length === 0) {
            return res.status(400).json({ error: "No chapters initialized" });
        }

        req.session.chapterIndex++;
        const chapter = String(chapters[req.session.chapterIndex % chapters.length]);
        req.session.currentChapter = chapter;

        console.log("CHAPTER KEYS:", Object.keys(req.session.chapterSummary));
        console.log("REQUESTED CHAPTER:", chapter);

        const syllabusText = req.session.chapterSummary[chapter];

        if (!syllabusText) {
            console.error("no chapter text", chapter);
            return res.status(500).json({
                error: `No syllabus found for chapter ${chapter}`
            });
        }

        // increase the question number
        req.session.qno++;

        // set the tier
        req.session.tier = 
            req.session.level <= -6 ? "d" :
            req.session.level <= -1 ? "c" :
            req.session.level <= 5 ? "b" :
            "a";

        // prompt
        const prompt = `
            You are EdVenture AI, an adaptive school tutor.

            ========================
            ANTI-REPEAT SYSTEM
            ========================
            Random seed: ${Date.now() % 100000}
            Question index: ${req.session.qno}

            Previously asked questions (DO NOT REUSE CONCEPT OR FORMAT):
            ${req.session.usedQuestions.slice(-5).join("\n")}

            RULE:
            Even if numbers or wording change, DO NOT reuse the same question structure or logic.

            ========================
            STRICT RULES
            ========================
            - ONLY use the provided syllabus
            - NO external knowledge
            - NO diagrams, figures, images, tables, or graphs
            - Output ONLY valid JSON
            - MUST follow schema rules EXACTLY
            - explanation is ALWAYS required
            - Questions MUST remain school-level and syllabus-aligned
            - NEVER generate malformed JSON

            ========================
            DIFFICULTY SYSTEM (LOCKED)
            ========================
            Current tier: ${req.session.tier}

            D: very easy, single-step  
            C: simple application  
            B: standard CBSE/NCERT  
            A: harder school-level reasoning  

            DO NOT change tier.

            ========================
            QUESTION TYPES (STRICT)
            ========================

            ------------------------------------------------
            1. mcq
            ------------------------------------------------
            REQUIRED:
            - question
            - type = "mcq"
            - options an array of EXACTLY 4 strings)
            - correctAnswer
            - explanation
            - subjective: false

            RULES:
            - correctAnswer MUST exactly equal one option
            - options MUST be unique

            FORBIDDEN:
            - column1
            - column2
            - wordLimit

            ------------------------------------------------
            2. fillblanks
            ------------------------------------------------
            REQUIRED:
            - question
            - type = "fillblanks"
            - correctAnswer
            - explanation
            - subjective: true

            RULES:
            - answer MUST be 1-4 words only
            - answer MUST be concise
            - question MUST contain a blank

            FORBIDDEN:
            - options
            - column1
            - column2

            ------------------------------------------------
            3. truefalse
            ------------------------------------------------
            REQUIRED:
            - question
            - type = "truefalse"
            - options = ["True", "False"]
            - correctAnswer
            - explanation
            - subjective: false

            RULES:
            - correctAnswer MUST be exactly:
            "True"
            OR
            "False"

            FORBIDDEN:
            - extra options
            - extra fields

            ------------------------------------------------
            4. matching
            ------------------------------------------------
            REQUIRED:
            - question
            - type = "matching"
            - column1
            - column2
            - correctAnswer
            - explanation
            - subjective: false

            RULES:
            - column1 and column2 MUST have same length
            - MINIMUM 2 items
            - correctAnswer MUST be in the form of:
            [[column1[xyzxyz],"column2[yzxyzx"], ["column1[x]","column2[y]"]]

            - correctAnswer MUST cover ALL items
            - column2 should be logically shuffled

            FORBIDDEN:
            - options field

            ------------------------------------------------
            5. ordering
            ------------------------------------------------
            REQUIRED:
            - question
            - type = "ordering"
            - options
            - correctAnswer
            - explanation
            - subjective: false

            RULES:
            - options MUST be shuffled
            - correctAnswer MUST contain the correctly ordered version
            - MINIMUM 3 items

            ------------------------------------------------
            6. shortqa
            ------------------------------------------------
            REQUIRED:
            - question
            - type = "shortqa"
            - sampleAnswer
            - explanation
            - wordLimit
            - subjective: true

            RULES:
            - student answer should be SHORT
            - wordLimit MUST equal:

            if (grade <= 5) {
                grade * 5
            } else {
               grade * 10
            }
            - sampleAnswer should be concise
            - question should require reasoning, not one-word recall

            FORBIDDEN:
            - options
            - column1
            - column2

            ------------------------------------------------
            7. longqa
            ------------------------------------------------
            REQUIRED:
            - question
            - type = "longqa"
            - sampleAnswer
            - explanation
            - minWords
            - subjective: true

            RULES:
            - minWords MUST equal shortqa wordLimit
            - answer should require detailed explanation
            - sampleAnswer should be detailed but concise enough for school level

            FORBIDDEN:
            - options
            - column1
            - column2

            ========================
            CRITICAL JSON RULES
            ========================
            - ONLY include fields required for that type
            - NEVER include unused fields
            - NEVER include null
            - NEVER include undefined
            - NEVER include comments
            - NEVER include markdown
            - NEVER wrap JSON in triple backticks
            - Output must work directly with JSON.parse()

            ========================
            ANTI-REPETITION RULES
            ========================
            - Vary:
            - question type
            - logic style
            - context
            - wording
            - reasoning method

            - NEVER reuse:
            - same structure
            - same numeric pattern
            - same scenario

            ========================
            SYLLABUS
            ========================
            ${syllabusText}

            ========================
            OUTPUT FORMAT
            ========================
            Return ONLY ONE valid JSON object.
        `;
        req.session.response = ""
        let cleanText;
        //try-catch loop for 429s and random 503s
        try{
            req.session.response = await genResponse(prompt);
            cleanText = await fixJson(req.session.response);
            console.log(cleanText)
        } catch(e){
            return res.status(500).json({ status: "500 Internal Server Error" });
        }
        
        let data;
        //try to parse json
        try {
            data = JSON.parse(cleanText);
        } catch (err) {
            console.error("json conversion failed", cleanText);
            throw err;
        }

        // store memory
        req.session.correctAnswer = data.correctAnswer;

        req.session.explanations ??= {}; //same thing for ??= here
        req.session.explanations[req.session.qno] = data.explanation || ""; //make an object for explanations

        //push current question in usedQuestions
        req.session.usedQuestions.push(data.question);

        // prevent memory explosion (Kaboom?) 
        if (req.session.usedQuestions.length > 30) {
            req.session.usedQuestions.shift();
        }

        //Success shall be ours
        res.status(200).json(data);

    } catch (err) {
        // most likely json parse error
        console.error("endpoint failed lol oops ", err);

        return res.status(500).json({
            status: "500 Internal Server Error",
            error: String(err)
        });
    }
});

// if subjective === true
router.post('/check', async (req, res) => {
    req.session.question = req.body.question;
    req.session.answer = req.body.answer;
    req.session.type = req.body.type;
    const syllabusText = req.session.chapterSummary?.[req.session.currentChapter] || "";

    const prompt = `You are EdVenture AI Grading Engine.

        You evaluate student answers for correctness, clarity, and concept accuracy.

        ========================
        CRITICAL RULES
        ========================
        - Output ONLY valid JSON
        - No markdown
        - No explanation outside JSON
        - No extra keys
        - Be strict but fair
        - Focus on concept correctness, not wording

        ========================
        INPUT YOU WILL RECEIVE
        ========================
        A question, a student's answer, and the type of the question.

        You must:
        1. Understand the question intent
        2. Compare student answer with expected concept
        3. Decide correctness (true/false OR partial credit reasoning)
        4. Provide a model answer
        5. Provide explanation of grading

        ========================
        GRADING RULE
        ========================
        - "correct" = true ONLY if concept is correct
        - minor spelling/grammar mistakes are ignored
        - partial correctness is allowed but still "correct: false"

        ========================
        OUTPUT FORMAT (STRICT)
        ========================
        {
        "correct": true/false,
        "explanation": "why the answer is correct or incorrect",
        }

        ========================
        SYLLABUS TEXT
        ========================
        ${JSON.stringify(syllabusText)};

        ========================
        INPUT
        ========================
        {
            question: ${JSON.stringify(req.session.question)},
            answer: ${JSON.stringify(req.session.answer)},
            type: ${JSON.stringify(req.session.type)}
        }
    `;

    let cleanText;
    try{
        req.session.response = await genResponse(prompt);
        cleanText = await fixJson(req.session.response);
        console.log(cleanText)
    } catch(e){
        return res.status(500).json({ status: "500 Internal Server Error" });
    }
        
    let data;
    //try to parse json
    try {
        data = JSON.parse(cleanText);
    } catch (err) {
        console.error("json conversion failed", cleanText);
        throw err;
    }

    res.status(200).json(data);
});

router.post('/explanation', async (req, res) => {
    req.session.question = req.body.question;
    req.session.doubt = req.body.doubt;
    const syllabusText = req.session.chapterSummary?.[req.session.currentChapter] || "";

    const prompt = `
        You are EdVenture AI Tutor Assistant.
        You help students understand school-level concepts clearly and simply.

        ========================
        CRITICAL RULES
        ========================
        - Output ONLY valid JSON
        - No markdown
        - No extra keys
        - No unrelated information
        - Keep explanation simple and school-level (CBSE style)

        ========================
        YOUR TASK
        ========================
        The student will ask a doubt about a question.

        You must:
        1. Understand the question context
        2. Identify what the student does not understand
        3. Explain clearly step-by-step
        4. Use simple language (no advanced jargon unless necessary)
        5. Give short examples if helpful

        ========================
        OUTPUT FORMAT (STRICT)
        ========================
        {
        "answer": "clear explanation of the doubt"
        }

        ========================
        SYLLABUS TEXT
        ========================
        ${JSON.stringify(syllabusText)};

        ========================
        INPUT
        ========================
        {
            question: ${JSON.stringify(req.session.question)},
            doubt: ${JSON.stringify(req.session.doubt)}
        }
    `;

    let cleanText;
    try{
        req.session.response = await genResponse(prompt);
        cleanText = await fixJson(req.session.response);
        console.log(cleanText);
    } catch(e){
        return res.status(500).json({ status: "500 Internal Server Error" });
    }

    let data;
    //try to parse json
    try {
        data = JSON.parse(cleanText);
    } catch (err) {
        console.error("json conversion failed", cleanText);
        throw err;
    }

    res.status(200).json(data);
})

export default router;