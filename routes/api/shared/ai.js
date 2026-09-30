import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";

const ai = new GoogleGenAI({});
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
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

export {
    genQuestionGemini,
    genQuestionGroq,
    genResponse,
    fixJson,
    safeParseJson
};