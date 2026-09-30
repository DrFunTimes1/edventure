

export function createLearnHelpers({ ai, groq, db }) {
    const logPrefix = "[LEARN/SHARED.JS]";

    

    

    


    

    
    

    

    
    

    

    return {
        db,
        loadChapter,
        roundScore,
        normalizeConceptName,
        toTitleCase,
        getSubjectStats,
        buildNextLesson,
        normalizeConceptList,
        safeParseJson,
        normalizeMasteryEntry,
        normalizeMastery,
        getMasteryScore,
        calculateTier,
        pickRandomChapter,
        loadChapterFromSession,
        filterChapterConcepts,
        genResponse,
        fixJson,
        compareObjectiveAnswer,
        roundNumber,
        saveLessonHistory,
        loadLessonHistory,
        loadStudentGrade,
        chooseSubject,
        chooseChapter,
        chooseConcepts,
        validateQuest,
        questProgress,
        updateXp,
        checkNextLevel,
        calculateQuestXp,
        updateStreak,
        lessonAchievement,
        questionAchievement,
        streakAchievement,
        masteryAchievement,
        levelAchievement
    };
}