import express from 'express';
const router = express.Router();
import 'dotenv/config';
import { neonConfig, neon } from '@neondatabase/serverless';
import session from 'express-session'

const db = neon(process.env.DB_URL);

router.use(express.json())

router.get('/', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            status: "401 UNAUTHORIZED",
            loggedin: false
        });
    }
    const id = req.session.userId;
    const result = await db`
        SELECT *
        FROM users
        WHERE id = ${id}
    `;
    const currentUser = result[0];

    res.status(200).json({
        status: "200 OK",
        user: currentUser,
        loggedin: true
    });
});

export default router;