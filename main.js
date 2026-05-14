import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { neonConfig, neon } from '@neondatabase/serverless';
import cors from 'cors';
import 'dotenv/config';

import root from './routes/root.js';
import login from './routes/api/auth/login.js';
import signup from './routes/api/auth/signup.js';
import getfriends from './routes/api/friends/getfriends.js';
import addfriends from './routes/api/friends/add.js';
import question from './routes/api/prediag/question.js';
import backendworks from './routes/api/backendworks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
const db = neon(process.env.DB_URL);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());

(async () => {
    const resultUsers = await db`
        CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        fname TEXT,
        lname TEXT,
        email TEXT UNIQUE,
        password TEXT,
        friend_code TEXT
        )    
    `;
})();

(async () => {
    const resultFriends = await db`
        CREATE TABLE IF NOT EXISTS friends (
        id SERIAL PRIMARY KEY,
        user_id TEXT,
        friend_id TEXT,
        friend_name TEXT
        )    
    `;
})();

app.use('/', root);
app.use('/api/auth/login', login);
app.use('/api/auth/signup', signup);
app.use('/api/friends/getfriends', getfriends);
app.use('/api/friends/add', addfriends);
app.use('/api/prediag', question);
app.use('/api/backendworks', backendworks);

app.listen(port, () => {
    console.log("Server is running on port " + port);
});