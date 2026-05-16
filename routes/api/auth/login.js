import express from 'express';
const router = express.Router()
import 'dotenv/config';
import bcrypt from "bcrypt";

import { neonConfig, neon } from '@neondatabase/serverless';
const db = neon(process.env.DB_URL);

console.log(".../auth/login.js loaded")

router.use(express.json())

router.post('/', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await db`SELECT * FROM users WHERE email = ${email} AND password = ${password}`;
        const user = result[0];

        const valid = await bcrypt.compare(password, user.password);

        if(!valid) {
            return res.status(401).json({
                error: "invalid credentials"
            })
        }
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