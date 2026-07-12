const initForm = document.getElementById("initForm");
const initPanel = document.getElementById("initPanel");
const initStatus = document.getElementById("initStatus");
const languageInput = document.getElementById("languageInput");
const gradeInput = document.getElementById("gradeInput");
const chaptersInput = document.getElementById("chaptersInput");

const lessonPanel = document.getElementById("lessonPanel");
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

function syncCheckButtonState() {
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

function parseChapters(input) {
    return input
        .split(",")
        .map((item) => Number(item.trim()))
        .filter((value) => !Number.isNaN(value));
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
    answerStatus.textContent = "";
    resultPanel.classList.add("hidden");
    userAnswerEl.textContent = "";
    correctAnswerEl.textContent = "";
    explanationEl.textContent = "";
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
    isLoading = true;
    questionText.textContent = "Loading...";
    nextQuestionButton.disabled = true;
    checkAnswerButton.disabled = true;

    try {
        const res = await apiRequest("/api/learn/question");

        currentQuestion = res;
        currentType = currentQuestion.type;

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

checkAnswerButton.onclick = async () => {
    if (isLoading || checkAnswerButton.disabled) return;
    checkAnswerButton.disabled = true;
    let answer;
    let userAnswerText = "";
    let correctAnswerText = "";
    let isCorrect = false;

    try {
        if (currentType === "mcq" || currentType === "truefalse") {
            answer = selectedAnswer;
            userAnswerText = answer || "";
            correctAnswerText = currentQuestion.correctAnswer || "";
        } else if (currentType === "matching") {
            const column1 = currentQuestion.column1 || [];
            const column2 = currentQuestion.column2 || [];
            if (column1.length === 0 || column2.length === 0) {
                answerStatus.textContent = "Matching data is missing.";
                answerStatus.style.color = "red";
                return;
            }

            const missing = column1.some((item) => !matchingSelections[item]);
            if (missing) {
                answerStatus.textContent = "Please match all items.";
                answerStatus.style.color = "red";
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
                return;
            }

            answer = orderingSelection.slice();

            userAnswerText = answer.join(" -> ");
            correctAnswerText = formatObjectiveAnswer(currentQuestion.correctAnswer, currentType);
        } else {
            answer = document.getElementById("textAnswer").value.trim();
            if (!answer) {
                return;
            }
            userAnswerText = answer || "";
            correctAnswerText = currentQuestion.sampleAnswer || currentQuestion.correctAnswer || "";
        }

        const res = await apiRequest("/api/learn/check",
            "POST",
            {
                question: currentQuestion.question,
                answer,
                type: currentQuestion.type
            }
        );

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
        nextQuestionButton.disabled = false;
        if (currentType === "ordering") {
            clearOrderButton.disabled = true;
        }
    } catch (err) {
        answerStatus.textContent = err?.message || "Failed to check answer.";
        answerStatus.style.color = "red";
        nextQuestionButton.disabled = false;
    } finally {
        if (resultPanel.classList.contains("hidden")) {
            syncCheckButtonState();
        } else {
            checkAnswerButton.disabled = true;
        }
    }
};

nextQuestionButton.onclick = () => {
    if (isLoading) return;
    loadQuestion();
};

initForm.onsubmit = async (e) => {
    e.preventDefault();

    const language = languageInput.value;
    const grade = Number(gradeInput.value);
    const chapters = parseChapters(chaptersInput.value);

    if (!language || Number.isNaN(grade)) {
        initStatus.textContent = "Please enter a valid language and grade.";
        return;
    }

    await apiRequest("/api/learn/init",
        "POST", 
        {
            language,
            grade,
            completedChapters: chapters
        }
    );

    initPanel.classList.add("hidden");
    lessonPanel.classList.remove("hidden");

    await loadQuestion();
};

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