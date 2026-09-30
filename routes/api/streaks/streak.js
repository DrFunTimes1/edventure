import express from 'express';
const router = express.Router();
import { db } from "../shared/db.js"
const logPrefix = "[STREAK/STREAK.JS]";
const DEBUG_ENABLED = process.env.NODE_ENV !== "production"

router.post('/', async (req, res) => {
    const result = await db`
            SELECT start_date, end_date
            FROM streaks
            WHERE user_id = ${req.session.userId}
            ORDER BY start_date DESC
            LIMIT 1
        `;

    if (!result[0]) {
        return res.status(200).json({
            status: "200 OK",
            streak: 0
        });
    }

    const startDate = new Date(result[0].start_date);
    const endDate = result[0].end_date
        ? new Date(result[0].end_date)
        : new Date();

    const difference = endDate - startDate;
    const days = 1 + Math.max(0, Math.floor(difference / (1000 * 60 * 60 * 24)));

    console.log(logPrefix, days, "day streak");

    res.status(200).json({
        status: "200 OK",
        streak: days
    })
});
export default router;