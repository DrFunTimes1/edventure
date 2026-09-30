import express from "express";
import { db } from "../shared/db.js";
import {
    lessonAchievement,
    questionAchievement,
    streakAchievement,
    masteryAchievement,
    levelAchievement
} from "../shared/achievements.js";
const router = express.Router();
const logPrefix = "[ACHIEVEMENTS/ACHIEVEMENTS.JS]";

router.post('/', async (req, res) => {
    const achievements = [
        // lesson achievements
        ["first_steps", "First Steps", "Complete your first lesson.", "lesson", 1],
        ["getting_started", "Getting Started", "Complete 10 lessons.", "lesson", 10],
        ["bookworm", "Bookworm", "Complete 25 lessons.", "lesson", 25],
        ["knowledge_seeker", "Knowledge Seeker", "Complete 50 lessons.", "lesson", 50],
        ["enlightened", "Enlightened", "Complete 100 lessons.", "lesson", 100],

        // correct questions achievements
        ["beginners_luck", "Beginner's Luck", "Complete 1 question correctly.", "question", 1],
        ["perfectionist", "Perfectionist", "Complete 10 questions correctly.", "question", 10],
        ["no_room_for_error", "No Room for Error", "Complete 25 questions correctly.", "question", 25],
        ["brainiac", "Brainiac", "Complete 50 questions correctly.", "question", 50],
        ["questionable_genius", "Questionable Genius", "Complete 100 questions correctly.", "question", 100],
        ["nobel", "Nobel", "Complete 500 questions correctly.", "question", 500],

        // streak achievements
        ["first_day_here", "First Day Here", "Have a one-day streak.", "streak", 1],
        ["warming_up", "Warming Up", "Have a 3-day streak.", "streak", 3],
        ["week_streak", "Week Streak", "Have a 7-day streak.", "streak", 7],
        ["dedicated", "Dedicated", "Have a 14-day streak.", "streak", 14],
        ["unstoppable", "Unstoppable", "Have a 30-day streak.", "streak", 30],
        ["topper", "Topper", "Have a 100-day streak.", "streak", 100],
        ["year_rounder", "Year Rounder", "Have a year-long streak.", "streak", 365],
        ["millennium_mindset", "Millennium Mindset", "Have a 1000-day streak.", "streak", 1000],

        // mastery achievements
        ["sharp_mind", "Sharp Mind", "Have an overall mastery of at least 80%.", "mastery", 80],
        ["master", "Master", "Have an overall mastery of at least 90%.", "mastery", 90],
        ["flawless", "Flawless", "Have an overall mastery of 100%.", "mastery", 100],

        // level achievements
        ["level_up", "Level Up!", "Reach level 1.", "level", 1],
        ["barely_started", "Barely Started", "Reach level 2.", "level", 2],
        ["flow_state", "Flow State", "Reach level 5.", "level", 5],
        ["double_digits", "Double Digits", "Reach level 10.", "level", 10],
        ["mildly_educated", "Mildly Educated", "Reach level 15.", "level", 15],
        ["suspiciously_knowledgeable", "Suspiciously Knowledgeable", "Reach level 25.", "level", 25],
        ["professional", "Professional", "Reach level 40.", "level", 40],
        ["the_grind", "The Grind", "Reach level 50.", "level", 50],
        ["edventure_pro", "EdVenture Pro", "Reach level 75.", "level", 75],
        ["academic_warrior", "Academic Warrior", "Reach level 100.", "level", 100],
        ["living_in_the_impossible", "Living in the Impossible", "Reach level 150.", "level", 150]
    ];

    const checkers = {
        lesson: lessonAchievement,
        question: questionAchievement,
        streak: streakAchievement,
        mastery: masteryAchievement,
        level: levelAchievement
    }
    const unlocked = []

    for (const [id, name, description, type, target] of achievements) {
        if (await checkers[type](req, target)) {
            try {
                const result = await db`
                        INSERT INTO achievements (user_id, achievement_id, achievement, description)
                        VALUES (
                            ${req.session.userId},
                            ${id},
                            ${name},
                            ${description}
                        )
                        ON CONFLICT (user_id, achievement)
                        DO NOTHING
                        RETURNING achievement_id
                    `;

                if (result.length > 0) {
                    unlocked.push({
                        id: id,
                        name: name,
                        description: description,
                        type: type
                    });
                }

            } catch (err) {
                return res.status(500).json({
                    status: "500 INTERNAL SERVER ERROR",
                    error: err,
                    unlocked: []
                });
            }
        }
    }
    console.log(logPrefix, "unlocked achievements", unlocked);
    res.status(200).json({
        status: "200 OK",
        unlocked: unlocked
    });
});

export default router;