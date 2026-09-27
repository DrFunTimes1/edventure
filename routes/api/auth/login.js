import express from 'express';
const router = express.Router()
import 'dotenv/config';
import bcrypt from "bcrypt";
import session from 'express-session'

import { neonConfig, neon } from '@neondatabase/serverless';
const db = neon(process.env.DB_URL);

router.use(express.json())

const logPrefix = "[AUTH/LOGIN.JS]";

router.post('/', async (req, res) => {
    const { email, password } = req.body;
    try {
        if (!email || !password) {
            return res.status(400).json({ error: "Missing login fields" });
        }

        const result = await db`SELECT * FROM users WHERE email = ${email}`;
        const user = result[0];

        if (!user) {
            return res.status(401).json({ error: "invalid credentials" });
        }

        const valid = await bcrypt.compare(password, user.password);

        if(!valid) {
            return res.status(401).json({
                error: "invalid credentials"
            })
        }

        // regenerate session
        req.session.regenerate((err) => {
            //fail
            if (err){
                console.error(logPrefix, "Failed to regenerate a new session! ", err);
                return res.status(500).json({ error: "failed to regenerate session" });
            }

            //success
            req.session.userId = user.id;

            return res.status(200).json({
                userId: user.id,
                name: user.fname
            });
        });
    } catch(err) {
        console.error(logPrefix, err);
        return res.status(500).json({
            status: "500 internal server error"
        });
    }
});

export default router;