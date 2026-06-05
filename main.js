import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';
import cors from 'cors';
import 'dotenv/config';

import root from './routes/root.js';
import login from './routes/api/auth/login.js';
import signup from './routes/api/auth/signup.js';
import getUser from './routes/api/auth/getUser.js';
import getfriends from './routes/api/friends/getfriends.js';
import addfriends from './routes/api/friends/add.js';
import question from './routes/api/prediag/question.js';
import learn from './routes/api/learn/learn.js';
import backendworks from './routes/api/backendworks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
const db = neon(process.env.DB_URL);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(session({
    secret: "edventure-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        sameSite: "lax"
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

        // FIX: CRITICAL — user_id MUST be unique for ON CONFLICT to work
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
app.use('/api/prediag', question);
app.use('/api/learn', learn);
app.use('/api/backendworks', backendworks);

app.listen(port, () => {
    console.log("Server is running on port " + port);
});