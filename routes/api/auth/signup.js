import express from 'express';
const router = express.Router()
import 'dotenv/config';

import { neonConfig, neon } from '@neondatabase/serverless';
const db = neon(process.env.DB_URL);

router.use(express.json())

router.post('/', async (req, res) => {
    const { email, password, fname, lname } = req.body;
    try{
        let friendcode = friend_code(6);
        await db`
        INSERT INTO users (fname, lname, email, password, friend_code)
        VALUES
        (${fname}, ${lname}, ${email}, ${password}, ${friendcode})
        `
        res.status(201).json({
            status: "201 created"
        })
    } catch (err) {
        console.log(err);
        res.status(500).json({
            status: "500 internal server error"
        })
    }
});

function friend_code(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

export default router;