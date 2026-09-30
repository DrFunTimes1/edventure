import express from 'express';
import 'dotenv/config';
import registerInitRoute from './init.js';
import registerQuestionRoute from './question.js';
import registerCheckRoute from './check.js';
import registerExplanationRoute from './explanation.js';
import registerDashboardRoute from './dashboard.js';
import registerXpDebugRoute from './xp-debug.js';

import { db } from "../shared/db.js";

import {
    genResponse,
    fixJson,
    safeParseJson
} from "../shared/ai.js";

import {
    normalizeMastery,
    normalizeMasteryEntry,
    getMasteryScore,
    calculateTier,
    roundScore,
    roundNumber,
    normalizeConceptList,
    normalizeConceptName
} from "../shared/mastery.js";

import {
    loadChapterFromSession,
    buildNextLesson,
    compareObjectiveAnswer,
    saveLessonHistory,
    loadLessonHistory,
    loadStudentGrade,
    pickRandomChapter,
    filterChapterConcepts
} from "../shared/lessons.js";

import {
    updateXp,
    checkNextLevel,
    calculateQuestXp
} from "../shared/xp.js";

import {
    updateStreak
} from "../shared/streak.js";

const helpers = {
    db,

    genResponse,
    fixJson,
    safeParseJson,

    normalizeMastery,
    normalizeMasteryEntry,
    getMasteryScore,
    calculateTier,
    roundScore,
    roundNumber,
    normalizeConceptList,
    normalizeConceptName,

    loadChapterFromSession,
    buildNextLesson,
    compareObjectiveAnswer,
    saveLessonHistory,
    loadLessonHistory,
    loadStudentGrade,
    pickRandomChapter,
    filterChapterConcepts,

    updateXp,
    checkNextLevel,
    calculateQuestXp,

    updateStreak
};
const router = express.Router();

router.use(express.json());

registerInitRoute(router, helpers);
registerQuestionRoute(router, helpers);
registerCheckRoute(router, helpers);
registerExplanationRoute(router, helpers);
registerDashboardRoute(router, helpers);
registerXpDebugRoute(router, helpers);

export default router;