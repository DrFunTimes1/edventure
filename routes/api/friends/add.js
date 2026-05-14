import express from 'express';
const router = express.Router()
import 'dotenv/config';

import { neonConfig, neon } from '@neondatabase/serverless';
const db = neon(process.env.DB_URL);

router.use(express.json())

router.post('/', async (req, res) => {
    const userId = req.body.userId;
    const friendCode = req.body.friendCode;

    try{
        const friendInfo = await db`
        SELECT fname, id FROM users WHERE friend_code=${friendCode}
        `;

        const data = await db`
            INSERT INTO friends (user_id, friend_id, friend_name) 
            VALUES (
                ${userId},
                ${friendInfo[0].id},
                ${friendInfo[0].fname}
            )
        `;

        res.status(201).json({
            status: "201 Created"
        });
    } catch (error){
        res.status(500).json({
            status: "500 Internal Server Error"
        });
    }
});

export default router;