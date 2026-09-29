let edVentureXpState = {
    level: null,
    xp: null,
    xpRequired: null
};

function getXpRequired(level) {
    const numericLevel = Number(level);
    return Number.isFinite(numericLevel) && numericLevel >= 0
        ? Math.floor(300 * Math.pow(numericLevel + 1, 1.5))
        : null;
}

function updateXpDisplay(values = {}) {
    const rawLevel = values.level ?? edVentureXpState.level;
    const rawXp = values.xp ?? values.currentXp ?? edVentureXpState.xp;
    const rawXpRequired = values.xpRequired ?? edVentureXpState.xpRequired;
    const level = rawLevel == null ? NaN : Number(rawLevel);
    const xp = rawXp == null ? NaN : Number(rawXp);
    const xpRequiredValue = rawXpRequired == null ? NaN : Number(rawXpRequired);
    const xpRequired = Number.isFinite(xpRequiredValue) && xpRequiredValue > 0
        ? xpRequiredValue
        : getXpRequired(level);

    edVentureXpState = {
        level: Number.isFinite(level) ? level : null,
        xp: Number.isFinite(xp) ? xp : null,
        xpRequired: Number.isFinite(xpRequired) ? xpRequired : null
    };

    const percentage = edVentureXpState.xpRequired > 0 && edVentureXpState.xp != null
        ? Math.max(0, Math.min(100, (edVentureXpState.xp / edVentureXpState.xpRequired) * 100))
        : 0;
    const xpText = edVentureXpState.xp != null && edVentureXpState.xpRequired != null
        ? `${edVentureXpState.xp.toFixed(0)} / ${edVentureXpState.xpRequired.toFixed(0)} XP`
        : "XP unavailable";

    document.querySelectorAll("[data-xp-text]").forEach((element) => {
        element.textContent = xpText;
    });
    document.querySelectorAll("[data-xp-level]").forEach((element) => {
        element.textContent = edVentureXpState.level ?? "-";
    });
    document.querySelectorAll("[data-xp-percentage]").forEach((element) => {
        element.textContent = `${Math.round(percentage)}%`;
    });
    document.querySelectorAll("[data-xp-bar]").forEach((element) => {
        element.style.width = `${percentage}%`;
    });

    return { ...edVentureXpState, percentage };
}

async function loadXpState() {
    try {
        const response = await apiRequest("/api/auth/getUser");
        const user = response.user || response;
        return updateXpDisplay({
            level: user?.level,
            xp: user?.xp
        });
    } catch {
        return updateXpDisplay({});
    }
}

function showXpNotice(message, levelUp = false) {
    let notice = document.getElementById("xpNotice");

    if (!notice) {
        notice = document.createElement("div");
        notice.id = "xpNotice";
        document.body.appendChild(notice);
    }

    notice.textContent = message;
    notice.classList.toggle("level-up", levelUp);
    notice.classList.add("visible");
    window.clearTimeout(notice.hideTimer);
    notice.hideTimer = window.setTimeout(() => notice.classList.remove("visible"), 3500);
}

function showXpConfetti() {
    const container = document.createElement("div");
    container.className = "xp-confetti";
    container.setAttribute("aria-hidden", "true");

    for (let index = 0; index < 80; index++) {
        const piece = document.createElement("span");
        piece.style.setProperty("--x", `${Math.random() * 100}%`);
        piece.style.setProperty("--hue", `${Math.random() * 360}`);
        piece.style.setProperty("--delay", `${Math.random() * 0.4}s`);
        piece.style.setProperty("--duration", `${1.8 + Math.random() * 1.8}s`);
        piece.style.setProperty("--rotation", `${Math.random() * 360}deg`);
        container.appendChild(piece);
    }

    document.body.appendChild(container);
    window.setTimeout(() => container.remove(), 4000);
}

async function xpDebug(action, values = {}) {
    const response = await apiRequest("/api/learn/debug/xp", "POST", {
        action,
        ...values
    });

    updateXpDisplay(response);
    console.table({
        action,
        previousLevel: response.previousLevel,
        previousXp: response.previousXp,
        xpDelta: response.xpDelta,
        newLevel: response.level,
        newXp: response.xp,
        xpRequired: response.xpRequired,
        progress: response.progress,
        levelUp: response.levelUp
    });
    return response;
}

function xp_help() {
    console.log(`EdVenture XP debug tools (development only):

xp_state()                         -> Display current XP state
xp_refresh()                       -> Reload XP state from the backend/database
xp_add(amount)                     -> Add XP through real level-up logic
xp_remove(amount)                  -> Report whether downward XP is supported
xp_set_xp(amount)                  -> Set exact XP within the current level
xp_set_level(level)                -> Set an exact level
xp_set_state(level, xp)            -> Set level and XP together
xp_force_level_up()                -> Add enough XP to cross the next level
xp_add_to_next_level()             -> Same as xp_force_level_up()
xp_add_levels(count)               -> Cross one or more levels
xp_test_level_up(amount)           -> Add a configurable XP amount
xp_test_lesson(accuracy, questions)-> Apply the existing lesson XP formula once
xp_test_quest(type, params)        -> Apply calculateQuestXp() once

Examples:
xp_add(100)
xp_set_state(2, 50)
xp_test_lesson(80, 10)
xp_test_quest("COMPLETE_LESSONS", { lessons: 1 })`);
}

window.EdVentureXpDebug = {
    state: () => xpDebug("state"),
    refresh: () => xpDebug("refresh"),
    add: (amount) => xpDebug("add", { amount }),
    remove: (amount) => xpDebug("remove", { amount }),
    setXp: (xp) => xpDebug("set_xp", { xp }),
    setLevel: (level) => xpDebug("set_level", { level }),
    setState: (level, xp) => xpDebug("set_state", { level, xp }),
    forceLevelUp: () => xpDebug("force_level_up"),
    addToNextLevel: () => xpDebug("add_to_next_level"),
    addLevels: (levels) => xpDebug("add_levels", { levels }),
    testLevelUp: (amount) => xpDebug("test_level_up", { amount }),
    testLesson: (accuracy, questions) => xpDebug("test_lesson", { accuracy, questions }),
    testQuest: (type, params) => xpDebug("test_quest", { type, params })
};

window.xp_state = window.EdVentureXpDebug.state;
window.xp_refresh = window.EdVentureXpDebug.refresh;
window.xp_add = window.EdVentureXpDebug.add;
window.xp_remove = window.EdVentureXpDebug.remove;
window.xp_set_xp = window.EdVentureXpDebug.setXp;
window.xp_set_level = window.EdVentureXpDebug.setLevel;
window.xp_set_state = window.EdVentureXpDebug.setState;
window.xp_force_level_up = window.EdVentureXpDebug.forceLevelUp;
window.xp_add_to_next_level = window.EdVentureXpDebug.addToNextLevel;
window.xp_add_levels = window.EdVentureXpDebug.addLevels;
window.xp_test_level_up = window.EdVentureXpDebug.testLevelUp;
window.xp_test_lesson = window.EdVentureXpDebug.testLesson;
window.xp_test_quest = window.EdVentureXpDebug.testQuest;
window.xp_help = xp_help;
window.help = xp_help;

window.updateXpDisplay = updateXpDisplay;
window.loadXpState = loadXpState;
window.showXpNotice = showXpNotice;
window.showXpConfetti = showXpConfetti;
