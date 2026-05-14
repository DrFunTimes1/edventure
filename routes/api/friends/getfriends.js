import express from 'express';
const router = express.Router()
import 'dotenv/config';

import { neonConfig, neon } from '@neondatabase/serverless';
const db = neon(process.env.DB_URL);

router.use(express.json())

router.get('/', async (req, res) => {
    const id = req.query.id;
    let data = [];
    try{
        const friends = await db`
            SELECT friend_id FROM friends WHERE user_id = ${id}
        `;
        console.log("db1 ping done");

        const friendCode = await db`
            SELECT friend_code 
            FROM users 
            WHERE id = ${id} 
        `;
        console.log("db2 ping done");

        for(let i = 0; i < friends.length; i++){
            console.log("loop iteration no." + i);
            const tmp = await db`
                SELECT fname, friend_code, id 
                FROM users 
                WHERE id = ${friends[i].friend_id}
            `
            console.log("successfully pinged db");
            if(tmp.length !== 0){
                data.push({
                    id: tmp[0].id,
                    fname: tmp[0].fname,
                    friend_code: tmp[0].friend_code
                });
            } else{
                console.error("no user found");
            }
            console.log("successfully pushed to data");
        }
        
        console.log("success shall be ours");

        res.status(200).json({
            friend_code: friendCode[0].friend_code,
            friends: data
        });
        
    } catch(err) {
        console.error(err);
        res.status(500).json({
            status: "500 Internal Server Error"
        });
    }
});

export default router;