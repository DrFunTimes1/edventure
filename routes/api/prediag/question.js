import express from 'express';
import session from "express-session";
import path, { normalize } from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import 'dotenv/config';
import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk"
import fs from "fs/promises";

const ai = new GoogleGenAI({});
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
router.use(session({
    secret: "edventure-secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

router.use(express.json());
router.use(cors());

//This converts files into strings so the AI can read them.
async function loadChapter(filePath) {
    return await fs.readFile(filePath, "utf8");
}

//This initializes stuff
router.post('/initDetails', async (req, res) => {
    try {
        req.session.grade = req.body.grade;
        req.session.chsDone = req.body.completedChapters || [];

        // reset stuff
        req.session.level = 0;
        req.session.qno = 0;
        req.session.chapterIndex = 0;
        req.session.usedQuestions = [];
        req.session.explanations = {};

        // cache the chapters
        req.session.chapterCache = {};

        for (let ch of req.session.chsDone) {
            const filePath = `books/grade ${req.session.grade}/maths/${ch}.txt`;

            try {
                req.session.chapterCache[ch] = await loadChapter(filePath);
            } catch (err) {
                console.error("Chapter load failed:", filePath, err);
                req.session.chapterCache[ch] = "";
            }
        }

        res.status(200).json({ status: "200 OK" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "init failed" });
    }
});

//the actual AI. This function generates the question in JSON.
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
async function genQuestionGroq(prompt, temperature = 1){
    try {
        const res = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
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


//takes the question and gives it to the frontend
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

        //so that gemini doesn't use 1 chapter for all questions (it does that)
        const chapter = chapters[req.session.chapterIndex % chapters.length];
        //make the chapter index stay between 0-[length-1] so that a certain ch can be used
        req.session.chapterIndex++;
        //increase by 1, so this goes on forever, but mod forces it to wrap at <length-1>

        //Get the syllabusText from the cache at init instead of loading the multi-thousand line files every time.
        const syllabusText = req.session.chapterCache?.[chapter] || "";
        //?. means if this exists, continue, else return undefined instead of DYING.

        if (!syllabusText) {
            console.warn("no chapter text", chapter);
        }

        req.session.qno++;

        req.session.tier = 
            req.session.level <= -6 ? "d" :
            req.session.level <= -1 ? "c" :
            req.session.level <= 5 ? "b" :
            "a";

        const prompt = `
            You are EdVenture AI, an adaptive school tutor.

            ========================
            ANTI-REPEAT SYSTEM
            ========================
            Random seed: ${Date.now() % 100000}
            Question index: ${req.session.qno}

            Previously asked questions (DO NOT REUSE CONCEPT OR FORMAT):
            ${req.session.usedQuestions.slice(-20).join("\n")}

            RULE:
            Even if numbers or wording change, DO NOT reuse the same question structure or logic.

            ========================
            STRICT RULES
            ========================
            - ONLY use the provided syllabus
            - NO external knowledge
            - NO diagrams, figures, images, tables, or graphs (convert all into text-only descriptions if needed)
            - Output ONLY valid JSON
            - Exactly 4 options
            - Exactly 1 correct answer
            - No explanations outside JSON

            ========================
            ANTI-DIAGRAM SAFETY
            ========================
            If syllabus mentions visuals:
            - Convert ALL visual info into explicit text description
            - NEVER say "see figure" or "as shown"
            - NEVER assume missing visuals

            ========================
            DIFFICULTY SYSTEM (LOCKED)
            ========================
            Current tier: ${req.session.tier}

            D: very easy, single-step, basic recall
            C: simple 1–2 step questions, no tricks
            B: standard NCERT/CBSE style questions
            A: harder school-level questions ONLY (no olympiad)

            You MUST NOT change tier difficulty.

            ========================
            ANTI-REPETITION RULES (IMPORTANT)
            ========================
            - Every question MUST test a different angle of the concept
            - Do NOT reuse:
            - same numbers
            - same story context
            - same phrasing structure
            - same question type pattern

            Examples of forbidden repetition:
            - "What is 2 + 3?" then "What is 4 + 5?" (same structure = BAD)
            - same MCQ format repeated with only numbers changed

            Instead:
            - change context (real life / abstract / reverse / reasoning / application)

            ========================
            QUESTION DESIGN RULE
            ========================
            Make questions:
            - conceptually different from last 15
            - varied format (definition / application / reasoning / comparison)
            - CBSE aligned\

            ==========================
            JSON RULES (VERY STRICT)
            ==========================
            - Refrain from putting only the option index (a/b/c/d) in the correctAnswer json field. You should enter the exact contents of what you gave in the options fiels (the correct answer only, not the other options). This is STRICT.
            - You are required to enter an explanation for the question.

            ========================
            SYLLABUS
            ========================
            ${syllabusText}

            ========================
            OUTPUT FORMAT (STRICT JSON)
            ========================
            {
            "question": "...",
            "options": ["A", "B", "C", "D"],
            "correctAnswer": "<Content of the option>",
            "explanation": "..."
            }
        `;

        req.session.response = ""
        await (async () => {
            try {
                req.session.response = await genQuestionGemini(prompt);
                console.log(req.session.response);
            } catch (e) {
                console.error("failed to use gemini, using groq instead. Actual error: ", e);
                try{
                    req.session.response =  await genQuestionGroq(prompt);
                } catch (e) {
                    res.status(500).json({status: "500 Internal Server Error"});
                }
            }
        })();   

        //If AI tries to be "helpful"
        let cleanText = req.session.response
            .replace(/```json/g, "") //replace all matches of that (/g means global) with ""
            .replace(/```/g, "") //same thing as above
            .replace(/^[^{]*/, "") // remove junk before {
            .replace(/[^}]*$/, "") // remove junk after }
            .trim(); //remove trailing tabs/spaces etc.

        let data;
        try {
            data = JSON.parse(cleanText);
        } catch (err) {
            console.error("json conversion failed", cleanText);
            throw err;
        }

        // store memory
        req.session.correctAnswer = data.correctAnswer;

        req.session.explanations ??= {}; //same thing for ??= here
        req.session.explanations[req.session.qno] = data.explanation || "";

        req.session.usedQuestions.push(data.question);

        // prevent memory explosion (Kaboom?)
        if (req.session.usedQuestions.length > 30) {
            req.session.usedQuestions.shift();
        }

        //Success shall be ours
        res.status(200).json({
            question: {
                text: data.question,
                options: data.options,
                correctAnswer: data.correctAnswer
            }
        });

    } catch (err) {
        console.error("endpint failed lol oops ", err);

        res.status(500).json({
            status: "500 Internal Server Error",
            error: String(err)
        });
    }
});

//answer checker
router.post('/question', (req, res) => {
    try {
        const studentAnswer = req.body.answer;

        if (studentAnswer === req.session.correctAnswer) {
            req.session.level = (req.session.level || 0) + 1;
            return res.json({ correct: true });
        } else {
            req.session.level = (req.session.level || 0) - 1;
            return res.json({ correct: false });
        }
    } catch (err) {
        console.error("ANSWER CHECK FAILED:", err);
        res.status(500).json({ error: "answer check failed" });
    }
});

//explanation
router.get('/explain', (req, res) => {
    try {
        const qno = Number(req.query.qno);
        const explanations = req.session.explanations || {};

        if (qno === null || qno === undefined || !explanations[qno]) {
            return res.status(404).json({ explanation: "" });
        }

        res.json({ explanation: explanations[qno] });

    } catch (err) {
        console.error("EXPLAIN FAILED:", err);
        res.status(500).json({ error: "explain failed" });
    }
});

export default router;