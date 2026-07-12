import express from 'express';
import 'dotenv/config';
import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import { neon } from '@neondatabase/serverless';
import { createLearnHelpers } from './shared.js';
import registerInitRoute from './init.js';
import registerQuestionRoute from './question.js';
import registerCheckRoute from './check.js';
import registerExplanationRoute from './explanation.js';

const ai = new GoogleGenAI({});
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const db = neon(process.env.DB_URL);

const helpers = createLearnHelpers({ ai, groq, db });
const router = express.Router();

router.use(express.json());

registerInitRoute(router, helpers);
registerQuestionRoute(router, helpers);
registerCheckRoute(router, helpers);
registerExplanationRoute(router, helpers);

export default router;