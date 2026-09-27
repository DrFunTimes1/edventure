const initPanel = document.getElementById("initPanel");
const initStatus = document.getElementById("initStatus");
const welcomeName = document.getElementById("welcomeName");
const welcomeTier = document.getElementById("welcomeTier");
const welcomeGrade = document.getElementById("welcomeGrade");
const focusList = document.getElementById("focusList");
const startLearningButton = document.getElementById("startLearningButton");

const lessonPanel = document.getElementById("lessonPanel");
const lessonCompletePanel = document.getElementById("lessonCompletePanel");
const confetti = document.getElementById("confetti");
const questionText = document.getElementById("questionText");
const optionsGrid = document.getElementById("optionsGrid");
const checkAnswerButton = document.getElementById("checkAnswerButton");
const clearOrderButton = document.getElementById("clearOrderButton");

const answerStatus = document.getElementById("answerStatus");
const resultPanel = document.getElementById("resultPanel");
const userAnswerEl = document.getElementById("userAnswer");
const correctAnswerEl = document.getElementById("correctAnswer");
const explanationEl = document.getElementById("explanation");

const nextQuestionButton = document.getElementById("nextQuestionButton");

const openDoubtButton = document.getElementById("openDoubtButton");
const doubtPanel = document.getElementById("doubtPanel");
const doubtOverlay = document.getElementById("doubtOverlay");
const closeDoubtButton = document.getElementById("closeDoubtButton");
const doubtForm = document.getElementById("doubtForm");
const doubtInput = document.getElementById("doubtInput");
const doubtMessages = document.getElementById("doubtMessages");

let currentQuestion = null;
let selectedAnswer = "";
let currentType = "";
let matchingSelections = {};
let orderingSelection = [];
let isLoading = false;
let isCheckingAnswer = false;
let currentQuestionChecked = false;
let currentQuestionId = null;
let currentUser = null;
let currentLesson = null;

loadLearnerSummary();

function setAnswerControlsDisabled(disabled) {
    optionsGrid.querySelectorAll("button, select, textarea, input").forEach((control) => {
        control.disabled = disabled;
    });

    clearOrderButton.disabled = disabled || clearOrderButton.classList.contains("hidden");
}

function setCheckingState(locked, label = null) {
    isCheckingAnswer = locked;
    checkAnswerButton.disabled = locked;
    checkAnswerButton.textContent = label || "Check Answer";
    setAnswerControlsDisabled(locked);
}

function clearSubmissionResult() {
    answerStatus.textContent = "";
    answerStatus.style.color = "";
    resultPanel.classList.add("hidden");
    userAnswerEl.textContent = "";
    correctAnswerEl.textContent = "";
    explanationEl.textContent = "";
}

function renderFocusList(concepts) {
    focusList.innerHTML = "";

    const items = Array.isArray(concepts) ? concepts.filter(Boolean) : [];

    if (items.length === 0) {
        const empty = document.createElement("li");
        empty.textContent = "Your lesson plan will appear here.";
        focusList.appendChild(empty);
        return;
    }

    items.forEach((concept) => {
        const item = document.createElement("li");
        item.textContent = concept;
        focusList.appendChild(item);
    });
}

function updateWelcomeSummary(status) {
    const firstName = currentUser?.fname ? String(currentUser.fname).trim() : "Learner";
    welcomeName.textContent = `Welcome back, ${firstName}!`;
    welcomeTier.textContent = `Current Tier: ${status?.tier || "C"}`;
    welcomeGrade.textContent = `Current Grade: ${status?.grade ?? "Not set"}`;
    renderFocusList(status?.currentLesson?.concepts || []);
}

function showLessonComplete(nextLesson, masteryGain) {
    lessonPanel.classList.add("lesson-finished");
    setCheckingState(true, "Check Answer");
    nextQuestionButton.disabled = true;
    clearOrderButton.disabled = true;
    openDoubtButton.classList.add("hidden");
    confetti.innerHTML = "";

    for (let index = 0; index < 80; index++) {
        const piece = document.createElement("span");
        piece.style.setProperty("--x", `${Math.random() * 100}%`);
        piece.style.setProperty("--hue", `${Math.random() * 360}`);
        piece.style.setProperty("--delay", `${Math.random() * 1.5}s`);
        piece.style.setProperty("--duration", `${2 + Math.random() * 2}s`);
        piece.style.setProperty("--rotation", `${Math.random() * 360}deg`);
        confetti.appendChild(piece);
    }

    lessonCompletePanel.classList.remove("hidden");
    window.setTimeout(() => {
        hideLessonComplete();
        lessonPanel.classList.add("hidden");
        initPanel.classList.remove("hidden");
        loadLearnerSummary();
    }, 2500);
}

function hideLessonComplete() {
    lessonPanel.classList.remove("lesson-finished");
    lessonCompletePanel.classList.add("hidden");
}

function syncCheckButtonState() {
    if (isLoading || isCheckingAnswer || currentQuestionChecked) {
        checkAnswerButton.disabled = true;
        return;
    }

    if (currentType === "mcq" || currentType === "truefalse") {
        checkAnswerButton.disabled = !selectedAnswer;
        return;
    }

    if (currentType === "matching") {
        const column1 = currentQuestion?.column1 || [];
        checkAnswerButton.disabled = !column1.length || !column1.every((value) => matchingSelections[value]);
        return;
    }

    if (currentType === "ordering") {
        const options = currentQuestion?.options || [];
        checkAnswerButton.disabled = orderingSelection.length !== options.length;
        return;
    }

    if (currentType === "shortqa" || currentType === "longqa" || currentType === "fillblanks") {
        const field = document.getElementById("textAnswer");
        checkAnswerButton.disabled = !field || field.value.trim().length === 0;
        return;
    }

    checkAnswerButton.disabled = true;
}

function parseMaybeJson(value) {
    if (typeof value !== "string") {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function formatObjectiveAnswer(value, type) {
    const parsed = parseMaybeJson(value);

    if (type === "matching") {
        const pairs = Array.isArray(parsed) ? parsed : [];
        return pairs.map((pair) => `${pair?.[0]} -> ${pair?.[1]}`).join("; ");
    }

    if (type === "ordering") {
        const items = Array.isArray(parsed) ? parsed : [];
        return items.join(" -> ");
    }

    return Array.isArray(parsed) ? JSON.stringify(parsed) : String(parsed ?? "");
}

function resetUI() {
    selectedAnswer = "";
    matchingSelections = {};
    orderingSelection = [];
    optionsGrid.innerHTML = "";
    clearSubmissionResult();
    checkAnswerButton.disabled = true;
    clearOrderButton.classList.add("hidden");
    clearOrderButton.disabled = true;
}

function renderMCQ(options) {
    optionsGrid.innerHTML = "";
    options.forEach(opt => {
        const btn = document.createElement("button");
        btn.textContent = opt;
        btn.className = "option-button";
        btn.onclick = () => {
            selectedAnswer = opt;
            [...optionsGrid.children].forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
            checkAnswerButton.disabled = false;
        };
        optionsGrid.appendChild(btn);
    });
}

function renderInput() {
    optionsGrid.innerHTML = "";

    const field = document.createElement("textarea");
    field.id = "textAnswer";
    field.placeholder = "Type answer...";
    field.rows = currentType === "longqa" ? 5 : 2;
    field.addEventListener("input", () => {
        checkAnswerButton.disabled = field.value.trim().length === 0;
    });
    optionsGrid.appendChild(field);
}

function renderMatching(column1, column2) {
    optionsGrid.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "matching-grid";

    column1.forEach((item) => {
        const row = document.createElement("div");
        row.className = "matching-row";

        const label = document.createElement("div");
        label.className = "matching-label";
        label.textContent = item;

        const select = document.createElement("select");
        select.className = "matching-select";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Select";
        select.appendChild(placeholder);

        column2.forEach((opt) => {
            const option = document.createElement("option");
            option.value = opt;
            option.textContent = opt;
            select.appendChild(option);
        });

        select.onchange = () => {
            matchingSelections[item] = select.value;
            const allSelected = column1.every((value) => matchingSelections[value]);
            checkAnswerButton.disabled = !allSelected;
        };

        row.appendChild(label);
        row.appendChild(select);
        grid.appendChild(row);
    });

    optionsGrid.appendChild(grid);
}

function renderOrdering(options) {
    optionsGrid.innerHTML = "";
    const container = document.createElement("div");
    container.className = "ordering-wrap";

    const list = document.createElement("div");
    list.className = "ordering-options";

    const preview = document.createElement("div");
    preview.className = "order-preview";
    preview.textContent = "Order: ";

    options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "option-button";
        btn.textContent = opt;
        btn.onclick = () => {
            if (orderingSelection.includes(opt)) return;
            orderingSelection.push(opt);
            btn.classList.add("selected");
            preview.textContent = `Order: ${orderingSelection.join(" -> ")}`;
            checkAnswerButton.disabled = orderingSelection.length !== options.length;
        };
        list.appendChild(btn);
    });

    container.appendChild(list);
    container.appendChild(preview);
    optionsGrid.appendChild(container);
    clearOrderButton.classList.remove("hidden");
    clearOrderButton.disabled = false;
    clearOrderButton.onclick = () => {
        orderingSelection = [];
        preview.textContent = "Order: ";
        [...list.children].forEach((child) => child.classList.remove("selected"));
        checkAnswerButton.disabled = true;
    };
}

async function loadQuestion() {
    await checkLoggedIn();
    hideLessonComplete();
    isLoading = true;
    questionText.textContent = "Loading...";
    nextQuestionButton.disabled = true;
    checkAnswerButton.disabled = true;
    checkAnswerButton.textContent = "Check Answer";

    try {
        const res = await apiRequest("/api/learn/question");

        currentQuestion = res;
        currentType = currentQuestion.type;
        currentQuestionId = currentQuestion.questionId || null;
        currentQuestionChecked = false;
        setCheckingState(false, "Check Answer");

        resetUI();
        questionText.textContent = currentQuestion.question;

        if (currentType === "mcq" || currentType === "truefalse") {
            renderMCQ(currentQuestion.options);
        } else if (currentType === "matching") {
            renderMatching(currentQuestion.column1 || [], currentQuestion.column2 || []);
        } else if (currentType === "ordering") {
            renderOrdering(currentQuestion.options || []);
        } else {
            renderInput();
        }

        syncCheckButtonState();
    } catch (err) {
        answerStatus.textContent = err?.message || "Failed to load question.";
        answerStatus.style.color = "red";
        questionText.textContent = currentQuestion?.question || "Failed to load question.";
        syncCheckButtonState();
        nextQuestionButton.disabled = false;
    } finally {
        isLoading = false;
    }
}

async function loadLearnerSummary() {
    try {
        await checkLoggedIn();
        const userResult = await apiRequest("/api/auth/getUser");
        const learnStatus = await apiRequest("/api/learn/status");
        const nextResult = await apiRequest("/api/learn/next");

        currentUser = userResult.user || null;
        currentLesson = nextResult.lesson || null;

        updateWelcomeSummary({
            ...learnStatus,
            currentLesson: nextResult.lesson || null
        });
        initStatus.textContent = "";
    } catch (err) {
        initStatus.textContent = err?.message || "Ready to start learning.";
        renderFocusList([]);
    }
}

async function startLearning(){
    startLearningButton.disabled = true;
    initStatus.textContent = "Preparing lesson...";
    try {
        const res = await apiRequest(
            "/api/learn/init",
            "POST",
            {}
        );

        currentLesson = res.currentLesson || currentLesson;
        updateWelcomeSummary({
            grade: res.grade,
            tier: res.tier,
            currentLesson
        });

        initPanel.classList.add("hidden");
        lessonPanel.classList.remove("hidden");
        hideLessonComplete();

        await loadQuestion();
    } catch(err){
        initStatus.textContent =
            err?.message ||
            "Failed to start lesson.";
    } finally {
        startLearningButton.disabled = false;
    }
}

checkAnswerButton.onclick = async () => {
    if (isLoading || isCheckingAnswer || currentQuestionChecked || checkAnswerButton.disabled) return;

    setCheckingState(true, "Checking...");
    clearSubmissionResult();
    nextQuestionButton.disabled = true;

    let answer;
    let userAnswerText = "";
    let correctAnswerText = "";
    let isCorrect = false;
    let requestWasSent = false;

    try {
        if (currentType === "mcq" || currentType === "truefalse") {
            answer = selectedAnswer;
            if (!answer) {
                setCheckingState(false, "Check Answer");
                syncCheckButtonState();
                return;
            }
            userAnswerText = answer || "";
            correctAnswerText = currentQuestion.correctAnswer || "";
        } else if (currentType === "matching") {
            const column1 = currentQuestion.column1 || [];
            const column2 = currentQuestion.column2 || [];
            if (column1.length === 0 || column2.length === 0) {
                answerStatus.textContent = "Matching data is missing.";
                answerStatus.style.color = "red";
                setCheckingState(false, "Check Answer");
                return;
            }

            const missing = column1.some((item) => !matchingSelections[item]);
            if (missing) {
                answerStatus.textContent = "Please match all items.";
                answerStatus.style.color = "red";
                setCheckingState(false, "Check Answer");
                return;
            }

            answer = column1.map((item) => [item, matchingSelections[item]]);

            userAnswerText = answer.map((pair) => `${pair[0]} -> ${pair[1]}`).join("; ");
            correctAnswerText = formatObjectiveAnswer(currentQuestion.correctAnswer, currentType);
        } else if (currentType === "ordering") {
            const options = currentQuestion.options || [];
            if (orderingSelection.length !== options.length) {
                answerStatus.textContent = "Please select all items in order.";
                answerStatus.style.color = "red";
                setCheckingState(false, "Check Answer");
                return;
            }

            answer = orderingSelection.slice();

            userAnswerText = answer.join(" -> ");
            correctAnswerText = formatObjectiveAnswer(currentQuestion.correctAnswer, currentType);
        } else {
            answer = document.getElementById("textAnswer").value.trim();
            if (!answer) {
                setCheckingState(false, "Check Answer");
                syncCheckButtonState();
                return;
            }
            userAnswerText = answer || "";
            correctAnswerText = currentQuestion.sampleAnswer || currentQuestion.correctAnswer || "";
        }

        requestWasSent = true;
        const res = await apiRequest("/api/learn/check",
            "POST",
            {
                question: currentQuestion.question,
                answer,
                type: currentQuestion.type,
                questionId: currentQuestionId
            }
        );

        if (res?.alreadyChecked) {
            if (res.questionCheckPending) {
                return;
            }

            currentQuestionChecked = true;
            answerStatus.textContent = res.message || "This question has already been checked.";
            answerStatus.style.color = "#555";
            checkAnswerButton.disabled = true;
            setAnswerControlsDisabled(true);
            nextQuestionButton.disabled = false;
            return;
        }

        const checkResult = res.data || res;

        isCorrect = !!checkResult.correct;
        if (checkResult.explanation) {
            explanationEl.textContent = checkResult.explanation;
        }

        if (checkResult.answer != null) {
            if (Array.isArray(checkResult.answer)) {
                if (currentType === "matching") {
                    correctAnswerText = checkResult.answer.map((pair) => `${pair[0]} -> ${pair[1]}`).join("; ");
                } else if (currentType === "ordering") {
                    correctAnswerText = checkResult.answer.join(" -> ");
                } else {
                    correctAnswerText = JSON.stringify(checkResult.answer);
                }
            } else {
                correctAnswerText = String(checkResult.answer);
            }
        }

        userAnswerEl.textContent = userAnswerText;
        correctAnswerEl.textContent = correctAnswerText;
        if (!explanationEl.textContent) {
            explanationEl.textContent = currentQuestion.explanation || "";
        }

        answerStatus.textContent = isCorrect ? "Correct" : "Wrong";
        answerStatus.style.color = isCorrect ? "green" : "red";

        resultPanel.classList.remove("hidden");

        if (checkResult.lessonFinished) {
            showLessonComplete();
            currentQuestionChecked = true;
            return;
        }

        currentQuestionChecked = true;
        nextQuestionButton.disabled = false;
        if (currentType === "ordering") {
            clearOrderButton.disabled = true;
        }
    } catch (err) {
        if (requestWasSent) {
            answerStatus.textContent = err?.message || "Failed to check answer.";
            answerStatus.style.color = "red";
            nextQuestionButton.disabled = false;
            setCheckingState(false, "Check Answer");
            return;
        }

        answerStatus.textContent = err?.message || "Failed to check answer.";
        answerStatus.style.color = "red";
        nextQuestionButton.disabled = false;
        setCheckingState(false, "Check Answer");
    } finally {
        if (currentQuestionChecked) {
            setCheckingState(true, "Check Answer");
        }
    }
};

nextQuestionButton.onclick = () => {
    if (isLoading) return;
    loadQuestion();
};

startLearningButton.onclick = startLearning;

// DOUBT PANEL
openDoubtButton.onclick = () => {
    doubtPanel.classList.add("open");
    doubtOverlay.classList.add("open");
};

closeDoubtButton.onclick = () => {
    doubtPanel.classList.remove("open");
    doubtOverlay.classList.remove("open");
};

doubtForm.onsubmit = async (e) => {
    e.preventDefault();

    const doubt = doubtInput.value;
    doubtInput.value = "";

    doubtMessages.innerHTML += `<div>You: ${doubt}</div>`;

    const res = await apiRequest("/api/learn/explanation", 
        "POST", 
        {
            question: currentQuestion.question,
            doubt
        }
    );

    

    doubtMessages.innerHTML += `<div>AI: ${res.answer}</div>`;
};

// Development-only browser debug tools for testing the lesson UI.
function showDebugState() {
    const state = {
        currentQuestion: currentQuestion?.question || null,
        currentQuestionId,
        currentType: currentType || null,
        currentQuestionChecked,
        lessonFinished: lessonPanel.classList.contains("lesson-finished"),
        currentLesson: currentLesson || null,
        isLoading,
        isCheckingAnswer
    };

    console.table(state);
    return state;
}

function showDebugHelp() {
    console.log(`EdVenture debug tools:

end_lesson()       -> Test the lesson-completion screen
show_completion()  -> Show the lesson-completion screen
reload_question()  -> Reload the current question
show_state()       -> Print current frontend lesson state
help()             -> Show this list`);
}

window.EdVentureDebug = {
    end_lesson: showLessonComplete,
    show_completion: showLessonComplete,
    reload_question: () => {
        if (typeof loadQuestion !== "function") {
            console.warn("EdVenture: question loading is not available.");
            return null;
        }

        return loadQuestion();
    },
    show_state: showDebugState,
    help: showDebugHelp
};

window.end_lesson = window.EdVentureDebug.end_lesson;
window.show_completion = window.EdVentureDebug.show_completion;
window.reload_question = window.EdVentureDebug.reload_question;
window.show_state = window.EdVentureDebug.show_state;
window.help = window.EdVentureDebug.help;