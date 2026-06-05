import express from 'express';
import session from "express-session";
import cors from 'cors';
import 'dotenv/config';
import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import fs from "fs/promises";
import { neon } from '@neondatabase/serverless';

const ai = new GoogleGenAI({});
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const db = neon(process.env.DB_URL);

const router = express.Router();

router.use(express.json());
router.use(cors({
    origin: true,
    credentials: true
}));

async function loadChapter(filePath) {
    return await fs.readFile(filePath, "utf8");
}

router.post('/init', async (req, res) => {
    try {
        const language = String(req.body.language || "").trim();
        const grade = Number(req.body.grade);
        const completedChapters = Array.isArray(req.body.completedChapters)
            ? req.body.completedChapters
            : [];
        const userId = req.session.userId || req.body.userId || null;

        if (!language || Number.isNaN(grade)) {
            return res.status(400).json({ error: "Invalid init data" });
        }

        req.session.subject = language;
        req.session.grade = grade;
        req.session.chsDone = completedChapters;

        if (userId) req.session.userId = userId;

        req.session.level = 0;
        req.session.qno = 0;
        req.session.chapterIndex = 0;
        req.session.usedQuestions = [];
        req.session.explanations = {};
        req.session.chapterCache = {};
        req.session.chapterSummary = {};

        for (const ch of req.session.chsDone) {
            const chapterKey = String(ch);
            const filePath = `books/grade ${req.session.grade}/${req.session.subject}/${chapterKey}.txt`;

            try {
                req.session.chapterSummary[chapterKey] = await loadChapter(filePath);
            } catch {
                req.session.chapterSummary[chapterKey] = "";
            }
        }

        if (req.session.userId) {
            await db`
                INSERT INTO progress (user_id, data)
                VALUES (${req.session.userId}, '{}'::jsonb)
                ON CONFLICT (user_id)
                DO NOTHING
            `;
        }

        res.json({ status: "ok" });

    } catch {
        return res.status(500).json({ status: "500 INTERNAL SERVER ERROR" });
    }
});

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

router.get('/question', async (req, res) => {
    try {
        req.session.qno ??= 0;
        req.session.usedQuestions ??= [];
        req.session.chapterIndex ??= 0;

        const chapters = req.session.chsDone || [];
        if (!chapters.length) {
            return res.status(400).json({ error: "No chapters" });
        }

        const chapter = chapters[req.session.chapterIndex % chapters.length];
        req.session.chapterIndex += 1;

        const chapterKey = String(chapter);
        req.session.currentChapter = chapterKey;

        const syllabusText = req.session.chapterSummary?.[chapterKey];
        if (!syllabusText) {
            return res.status(500).json({ error: "Missing syllabus" });
        }

        req.session.qno++;

        const prompt = `You are EdVenture AI, an adaptive school tutor. ======================== ANTI-REPEAT SYSTEM ======================== Random seed: ${Date.now() % 100000} Question index: ${req.session.qno} Previously asked questions (DO NOT REUSE CONCEPT OR FORMAT): ${req.session.usedQuestions.slice(-5).join("\n")} RULE: Even if numbers or wording change, DO NOT reuse the same question structure or logic. ======================== STRICT RULES ======================== - ONLY use the provided syllabus - NO external knowledge - NO diagrams, figures, images, tables, or graphs - Output ONLY valid JSON - MUST follow schema rules EXACTLY - explanation is ALWAYS required - Questions MUST remain school-level and syllabus-aligned - NEVER generate malformed JSON ======================== DIFFICULTY SYSTEM (LOCKED) ======================== Current tier: ${req.session.tier} D: very easy, single-step C: simple application B: standard CBSE/NCERT A: harder school-level reasoning DO NOT change tier. ======================== QUESTION TYPES (STRICT) ======================== ------------------------------------------------ 1. mcq ------------------------------------------------ REQUIRED: - question - type = "mcq" - options an array of EXACTLY 4 strings) - correctAnswer - explanation - subjective: false RULES: - correctAnswer MUST exactly equal one option - options MUST be unique FORBIDDEN: - column1 - column2 - wordLimit ------------------------------------------------ 2. fillblanks ------------------------------------------------ REQUIRED: - question - type = "fillblanks" - correctAnswer - explanation - subjective: true RULES: - answer MUST be 1-4 words only - answer MUST be concise - question MUST contain a blank FORBIDDEN: - options - column1 - column2 ------------------------------------------------ 3. truefalse ------------------------------------------------ REQUIRED: - question - type = "truefalse" - options = ["True", "False"] - correctAnswer - explanation - subjective: false RULES: - correctAnswer MUST be exactly: "True" OR "False" FORBIDDEN: - extra options - extra fields ------------------------------------------------ 4. matching ------------------------------------------------ REQUIRED: - question - type = "matching" - column1 - column2 - correctAnswer - explanation - subjective: false RULES: - column1 and column2 MUST have same length - MINIMUM 2 items - correctAnswer MUST be in the form of: [[column1[xyzxyz],"column2[yzxyzx"], ["column1[x]","column2[y]"]] - correctAnswer MUST cover ALL items - column2 should be logically shuffled FORBIDDEN: - options field ------------------------------------------------ 5. ordering ------------------------------------------------ REQUIRED: - question - type = "ordering" - options - correctAnswer - explanation - subjective: false RULES: - options MUST be shuffled - correctAnswer MUST contain the correctly ordered version - MINIMUM 3 items ------------------------------------------------ 6. shortqa ------------------------------------------------ REQUIRED: - question - type = "shortqa" - sampleAnswer - explanation - wordLimit - subjective: true RULES: - student answer should be SHORT - wordLimit MUST equal: if (grade <= 5) { grade * 5 } else { grade * 10 } - sampleAnswer should be concise - question should require reasoning, not one-word recall FORBIDDEN: - options - column1 - column2 ------------------------------------------------ 7. longqa ------------------------------------------------ REQUIRED: - question - type = "longqa" - sampleAnswer - explanation - minWords - subjective: true RULES: - minWords MUST equal shortqa wordLimit - answer should require detailed explanation - sampleAnswer should be detailed but concise enough for school level FORBIDDEN: - options - column1 - column2 REQUIRED FOR ALL { concept: "the concept". the concept can be anything from fractions to diagrams, from adjecives to verbs etc } ======================== CRITICAL JSON RULES ======================== - ONLY include fields required for that type - NEVER include unused fields - NEVER include null - NEVER include undefined - NEVER include comments - NEVER include markdown - NEVER wrap JSON in triple backticks - Output must work directly with JSON.parse() ======================== ANTI-REPETITION RULES ======================== - Vary: - question type - logic style - context - wording - reasoning method - NEVER reuse: - same structure - same numeric pattern - same scenario ======================== SYLLABUS ======================== ${syllabusText} ======================== OUTPUT FORMAT ======================== Return ONLY ONE valid JSON object.`

        const raw = await genResponse(prompt);
        const cleanText = fixJson(raw);

        let data = JSON.parse(cleanText);

        req.session.usedQuestions.push(data.question);
        req.session.correctAnswer = data.correctAnswer;

        res.json(data);

    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});

router.post('/check', async (req, res) => {
    try {
        const { question, answer, type } = req.body;

        if (!question || typeof answer !== "string" || !type) {
            return res.status(400).json({ error: "Invalid check data" });
        }

        const syllabusText = req.session.chapterSummary?.[req.session.currentChapter] || "";

        const prompt = `
            Return ONLY JSON:
            {
               "correct": true/false,
                "explanation": "..."
            }
            Question: ${question}
            Answer: ${answer}
            Type: ${type}
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

router.post('/explanation', async (req, res) => {
    try {
        const { question, doubt } = req.body;

        const syllabusText = req.session.chapterSummary?.[req.session.currentChapter] || "";

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

export default router;