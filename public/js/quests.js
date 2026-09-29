const questsGrid = document.getElementById("questsGrid");
const questsStatus = document.getElementById("questsStatus");
const confetti = document.getElementById("confetti");
const questStateKey = "edventure.questCompletionState";
const questDebugEnabled = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
let currentQuestData = { quests: [], progress: [] };
let lastQuestError = null;
const claimedQuestIds = new Set();

function readQuestState() {
    try {
        const state = JSON.parse(localStorage.getItem(questStateKey) || "{}");
        return state.date === new Date().toISOString().slice(0, 10) ? state.quests || {} : {};
    } catch {
        return {};
    }
}

function saveQuestState(state) {
    localStorage.setItem(questStateKey, JSON.stringify({
        date: new Date().toISOString().slice(0, 10),
        quests: state
    }));
}

function formatProgressValue(value, key) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "0";
    }

    return key === "accuracy" ? `${number.toFixed(0)}%` : number.toFixed(0);
}

function createConfetti() {
    confetti.innerHTML = "";

    for (let index = 0; index < 70; index++) {
        const piece = document.createElement("span");
        piece.style.setProperty("--x", `${Math.random() * 100}%`);
        piece.style.setProperty("--hue", `${Math.random() * 360}`);
        piece.style.setProperty("--delay", `${Math.random() * 0.5}s`);
        piece.style.setProperty("--duration", `${1.8 + Math.random() * 1.8}s`);
        piece.style.setProperty("--rotation", `${Math.random() * 360}deg`);
        confetti.appendChild(piece);
    }

    window.setTimeout(() => {
        confetti.innerHTML = "";
    }, 4000);
}

function getProgressForQuest(progress, quest, index) {
    if (Array.isArray(progress)) {
        return progress[index] || {};
    }

    return progress?.[quest.id] || {};
}

function renderQuest(quest, progress, previousState) {
    const questProgress = progress?.progress;
    const isCompleted = Boolean(progress?.completed);
    const hasPreviousState = Object.prototype.hasOwnProperty.call(previousState, quest.id);
    const wasCompleted = hasPreviousState && Boolean(previousState[quest.id]);
    const card = document.createElement("article");
    card.className = `quest-card${isCompleted ? " completed" : ""}`;
    card.dataset.questId = quest.id;

    const header = document.createElement("div");
    header.className = "quest-card-header";

    const number = document.createElement("span");
    number.className = "quest-number";
    number.textContent = `Quest ${quest.id ?? ""}`;

    const check = document.createElement("span");
    check.className = "quest-check";
    check.textContent = isCompleted ? "✓" : "";
    check.setAttribute("aria-label", isCompleted ? "Completed" : "Not completed");

    header.append(number, check);

    const content = document.createElement("p");
    content.className = "quest-content";
    content.textContent = quest.content;

    const requirements = document.createElement("div");
    requirements.className = "quest-requirements";

    Object.entries(questProgress || {}).forEach(([key, condition]) => {
        const done = Number(condition?.done);
        const target = Number(condition?.total);
        const percentage = target > 0 ? Math.min(100, Math.max(0, (done / target) * 100)) : 0;
        const requirement = document.createElement("div");
        requirement.className = "quest-requirement";

        const label = document.createElement("div");
        label.className = "quest-requirement-label";

        const name = document.createElement("span");
        name.textContent = key.replaceAll("_", " ");

        const value = document.createElement("strong");
        value.textContent = `${formatProgressValue(done, key)} / ${formatProgressValue(target, key)}`;

        label.append(name, value);

        const track = document.createElement("div");
        track.className = "quest-progress-track";

        const fill = document.createElement("div");
        fill.className = "quest-progress-fill";
        fill.style.width = `${percentage}%`;

        track.appendChild(fill);
        requirement.append(label, track);
        requirements.appendChild(requirement);
    });

    if (!Object.keys(questProgress || {}).length) {
        const missing = document.createElement("p");
        missing.className = "quest-missing-progress";
        missing.textContent = "Progress is unavailable right now.";
        requirements.appendChild(missing);
    }

    if (isCompleted) {
        const claimButton = document.createElement("button");
        claimButton.className = "quest-claim-button";
        claimButton.type = "button";
        claimButton.textContent = claimedQuestIds.has(quest.id) ? "XP Claimed" : "Claim XP";
        claimButton.disabled = claimedQuestIds.has(quest.id);
        claimButton.addEventListener("click", async () => {
            claimButton.disabled = true;
            claimButton.textContent = "Claiming...";

            try {
                const claim = await apiRequest(`/api/quests/${quest.id}/claim`, "POST", {});
                claimedQuestIds.add(quest.id);
                updateXpDisplay(claim);
                showXpConfetti();
                claimButton.textContent = `+${Number(claim.xp || 0)} XP Claimed`;
                showXpNotice(`+${Number(claim.xp || 0)} XP earned${claim.levelUp ? ` · Level ${claim.level}!` : ""}`, Boolean(claim.levelUp));
                animateClaimedQuest(quest.id);
            } catch (error) {
                claimButton.disabled = false;
                claimButton.textContent = "Claim XP";
                questsStatus.textContent = error?.message || "Unable to claim quest XP.";
                questsStatus.classList.add("error");
            }
        });
        requirements.appendChild(claimButton);
    }

    card.append(header, content, requirements);

    if (isCompleted && hasPreviousState && !wasCompleted) {
        createConfetti();
    }

    return card;
}

function animateClaimedQuest(id) {
    const card = questsGrid.querySelector(`[data-quest-id="${CSS.escape(String(id))}"]`);

    if (!card) {
        return;
    }

    card.classList.add("claimed");
    window.setTimeout(() => card.remove(), 450);
}

async function loadQuests() {
    try {
        lastQuestError = null;
        await checkLoggedIn();
        await loadXpState();
        const firstResponse = await apiRequest("/api/quests/", "POST", {});
        const response = firstResponse.progress
            ? firstResponse
            : await apiRequest("/api/quests/", "POST", {});
        const quests = Array.isArray(response.quests) ? response.quests : [];
        const progress = Array.isArray(response.progress) ? response.progress : [];

        if (quests.length !== 3 || progress.length !== quests.length || progress.some((item) => !item || typeof item !== "object")) {
            throw new Error("Quest progress data is unavailable right now.");
        }
        const previousState = readQuestState();
        const nextState = {};

        currentQuestData = { quests, progress };

        questsGrid.innerHTML = "";

        quests.forEach((quest, index) => {
            const questProgress = getProgressForQuest(progress, quest, index);
            nextState[quest.id] = Boolean(questProgress.completed);
            questsGrid.appendChild(renderQuest(quest, questProgress, previousState));
        });

        saveQuestState(nextState);
        questsStatus.textContent = quests.length === 3 ? "Keep going. Your daily goals are waiting." : "No quests are available right now.";
        return currentQuestData;
    } catch (error) {
        lastQuestError = error;
        questsStatus.textContent = error?.message || "Failed to load daily quests.";
        questsStatus.classList.add("error");
        return null;
    }
}

async function reloadQuests() {
    try {
        await apiRequest("/api/quests/reset", "POST", {});
    } catch (error) {
        lastQuestError = error;
        questsStatus.textContent = error?.message || "Failed to reset daily quests.";
        questsStatus.classList.add("error");
        console.error("EdVenture Quests: reset failed.", error);
        return null;
    }

    const data = await loadQuests();

    if (!data) {
        console.error("EdVenture Quests: reload failed.", lastQuestError);
        return null;
    }

    console.log("EdVenture Quests: reloaded successfully.", data);
    return data;
}

function showQuestState() {
    const state = {
        quests: currentQuestData.quests,
        progress: currentQuestData.progress,
        storedCompletionState: readQuestState(),
        lastError: lastQuestError?.message || null
    };

    console.log("EdVenture Quests state:", state);
    return state;
}

function resetQuestTracking() {
    localStorage.removeItem(questStateKey);
    console.log("EdVenture Quests: local completion tracking cleared.");
    return reloadQuests();
}

function markQuestsIncomplete() {
    const state = {};

    currentQuestData.quests.forEach((quest) => {
        state[quest.id] = false;
    });

    saveQuestState(state);
    console.log("EdVenture Quests: current quests marked incomplete locally.");
    return reloadQuests();
}

function testQuestConfetti() {
    createConfetti();
    console.log("EdVenture Quests: confetti test triggered.");
}

async function questClaim(id) {
    if (!questDebugEnabled) {
        console.warn("EdVenture: quest debug tools are disabled outside local development.");
        return null;
    }

    try {
        const prepareResponse = await fetch(`/api/quests/debug/complete/${encodeURIComponent(id)}`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({})
        });

        if (!prepareResponse.ok) {
            const prepareData = await prepareResponse.json();
            console.warn("EdVenture quest_claim preparation response:", {
                status: prepareResponse.status,
                ...prepareData
            });
            return prepareData;
        }

        const response = await fetch(`/api/quests/${encodeURIComponent(id)}/claim`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({})
        });
        const data = await response.json();

        console[response.ok ? "log" : "warn"]("EdVenture quest_claim response:", {
            status: response.status,
            ...data
        });

        if (!response.ok) {
            return data;
        }

        updateXpDisplay(data);
        claimedQuestIds.add(Number(id));
        showXpNotice(`+${Number(data.xp || 0)} XP earned${data.levelUp ? ` · Level ${data.level}!` : ""}`, Boolean(data.levelUp));
        showXpConfetti();
        animateClaimedQuest(id);
        return data;
    } catch (error) {
        console.error("EdVenture quest_claim failed:", error);
        return null;
    }
}

function help() {
    console.log(`EdVenture Quests help:

help()                  -> Show this list
reload_quests()         -> Fetch quests and backend progress again
show_quest_state()      -> Print current quests, progress, and local tracking
reset_quest_tracking()  -> Clear local completion tracking and reload
regenerate_quests()      -> Reset the session quest cache and generate fresh quests
mark_quests_incomplete()-> Mark current quests incomplete locally, then reload
test_quest_confetti()   -> Test the confetti animation without changing backend state

The Quests page:
- Calls POST /api/quests/.
- Displays the quests returned by the backend.
- Displays every requirement returned in progress[].progress.
- Uses progress[].completed for the completed state.
- Celebrates a newly detected incomplete-to-complete transition once per quest per day.
- Stores only quest completion state and the date in localStorage.`);

    if (questDebugEnabled) {
        console.log("quest_claim(id)         -> Call the real quest claim endpoint for a quest ID");
    }
}

window.EdVentureQuestDebug = {
    help,
    reload_quests: reloadQuests,
    regenerate_quests: reloadQuests,
    show_quest_state: showQuestState,
    reset_quest_tracking: resetQuestTracking,
    mark_quests_incomplete: markQuestsIncomplete,
    test_quest_confetti: testQuestConfetti
};

window.help = help;
window.reload_quests = reloadQuests;
window.regenerate_quests = reloadQuests;
window.show_quest_state = showQuestState;
window.reset_quest_tracking = resetQuestTracking;
window.mark_quests_incomplete = markQuestsIncomplete;
window.test_quest_confetti = testQuestConfetti;

if (questDebugEnabled) {
    window.quest_claim = questClaim;
}

loadQuests();
