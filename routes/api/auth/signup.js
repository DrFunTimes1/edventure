import express from 'express';
const router = express.Router();
import 'dotenv/config'; 
import bcrypt from "bcrypt" 
import { neonConfig, neon } from '@neondatabase/serverless';

const db = neon(process.env.DB_URL);

router.use(express.json())

router.post('/', async (req, res) => {
    const { email, unhashedpw, fname, lname } = req.body;

    if (!email || !unhashedpw || !fname || !lname) {
        return res.status(400).json({
            status: "400 BAD REQUEST",
            details: "missing fields"
        });
    }

    try {
        const password = await bcrypt.hash(unhashedpw, 15);
        const friendcode = await friendCode();

        const result = await db`
            INSERT INTO users (fname, lname, email, password, friend_code)
            VALUES (${fname}, ${lname}, ${email}, ${password}, ${friendcode})
            RETURNING id, email, fname, lname, friend_code
        `;

        console.log("INSERTED ROW:", result);
        
        return res.status(201).json({
            status: "201 CREATED"
        });

    } catch (err) {
        console.error("Signup error ughhhhhhhhhh: ", err);

        //duplicate
        if (err.code === "23505") {
            return res.status(409).json({
                status: "409 CONFLICT",
                detail: "Expected unique value, recieved duplicate"
            });
        }

        return res.status(500).json({
            status: "500 Internal Server Error"
        });
    }
});

async function friendCode(){
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
    let result = '';

    for (let i = 0; i <= 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export default router;