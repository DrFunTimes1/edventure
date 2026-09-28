import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';
import { createClient } from "redis";
import { RedisStore } from "connect-redis";
import cors from 'cors';
import 'dotenv/config';

import root from './routes/root.js';
import login from './routes/api/auth/login.js';
import signup from './routes/api/auth/signup.js';
import getUser from './routes/api/auth/getUser.js';
import getfriends from './routes/api/friends/getfriends.js';
import addfriends from './routes/api/friends/add.js';
import learn, { helpers as learnHelpers } from './routes/api/learn/learn.js';
import registerQuestsRoute from './routes/api/quests/quests.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
const db = neon(process.env.DB_URL);

export const redisClient = createClient({
    url: process.env.REDIS_URL
});
redisClient.on("error", (err) => {
    console.error("[REDIS]", err);
});
await redisClient.connect();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors({
    origin: "http://localhost:5173",
    credentials: true
}));
app.use(session({
    store: new RedisStore({
        client: redisClient
    }),

    secret: process.env.SESSION_SECRET,

    resave: false,
    saveUninitialized: false,

    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 30 // 30 days
    }
}));

const initDb = async () => {
    try {
        await db`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                fname TEXT,
                lname TEXT,
                email TEXT UNIQUE,
                password TEXT,
                friend_code TEXT
            )
        `;

        await db`
            CREATE TABLE IF NOT EXISTS friends (
                id SERIAL PRIMARY KEY,
                user_id TEXT,
                friend_id TEXT,
                friend_name TEXT
            )
        `;

        await db`
            CREATE TABLE IF NOT EXISTS progress (
                user_id TEXT PRIMARY KEY,
                data JSONB NOT NULL DEFAULT '{}'::jsonb,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `;

        await db`
            CREATE OR REPLACE FUNCTION set_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
        `;

        await db`
            DROP TRIGGER IF EXISTS progress_updated_at ON progress
        `;

        await db`
            CREATE TRIGGER progress_updated_at
            BEFORE UPDATE ON progress
            FOR EACH ROW
            EXECUTE FUNCTION set_updated_at()
        `;

        await db`
            CREATE TABLE IF NOT EXISTS lesson_history (
                id SERIAL PRIMARY KEY,

                user_id TEXT NOT NULL,

                subject TEXT,
                chapter TEXT,
                chapter_key TEXT,

                concepts JSONB DEFAULT '[]'::jsonb,

                mastery_gain REAL DEFAULT 0,
                questions_asked INTEGER DEFAULT 0,

                lesson_type TEXT,

                completed_at TIMESTAMP DEFAULT NOW()
            )
        `;
    } catch (err) {
        console.error("DB init failed:", err);
    }
};

initDb();

app.use('/', root);
app.use('/api/auth/login', login);
app.use('/api/auth/signup', signup);
app.use('/api/auth/getUser', getUser);
app.use('/api/friends/getfriends', getfriends);
app.use('/api/friends/add', addfriends);
app.use('/api/learn', learn);
const quests = express.Router();
quests.use(express.json());
registerQuestsRoute(quests, learnHelpers);
app.use('/api/quests', quests);

app.listen(port, () => {
    console.log("Server is running on port " + port);
});