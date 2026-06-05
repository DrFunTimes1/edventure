import express from 'express';
const router = express.Router()
import 'dotenv/config';
import bcrypt from "bcrypt";
import session from 'express-session'

import { neonConfig, neon } from '@neondatabase/serverless';
const db = neon(process.env.DB_URL);

router.use(express.json())

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
        req.session.userId = user.id; 
        res.status(200).json({
                userId: user.id,
                name: user.fname
            });
    } catch(err){
        console.log(err);
        res.status(500).json({
            status: "500 internal server error"
        });
    }
});

export default router;