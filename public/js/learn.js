const initForm = document.getElementById("initForm");
const initPanel = document.getElementById("initPanel");
const initStatus = document.getElementById("initStatus");
const languageInput = document.getElementById("languageInput");
const chaptersInput = document.getElementById("chaptersInput");

const lessonPanel = document.getElementById("lessonPanel");
const questionText = document.getElementById("questionText");
const optionsGrid = document.getElementById("optionsGrid");
const checkAnswerButton = document.getElementById("checkAnswerButton");
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

let currentQuestion = "";
let correctAnswer = "";
let selectedAnswer = "";
let answered = false;

function parseChapters(input) {
    return input
        .split(",")
        .map((entry) => Number(entry.trim()))
        .filter((value) => Number.isInteger(value) && value > 0);
}

function setInitStatus(message, isError = false) {
    initStatus.textContent = message;
    initStatus.classList.toggle("error", isError);
}

function resetAnswerState() {
    selectedAnswer = "";
    answered = false;
    answerStatus.textContent = "";
    answerStatus.className = "answer-status";
    resultPanel.classList.add("hidden");
    explanationEl.classList.remove("visible");
    explanationEl.textContent = "";
    checkAnswerButton.disabled = false;
}

function renderOptions(options) {
    optionsGrid.innerHTML = "";
    options.forEach((option) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "option-btn";
        button.textContent = option;
        button.addEventListener("click", () => selectOption(button, option));
        optionsGrid.appendChild(button);
    });
}

function selectOption(button, option) {
    if (answered) {
        return;
    }

    selectedAnswer = option;
    optionsGrid.querySelectorAll(".option-btn").forEach((btn) => {
        btn.classList.remove("selected");
    });
    button.classList.add("selected");
}

function revealAnswer() {
    if (!selectedAnswer || answered) {
        return;
    }

    answered = true;
    checkAnswerButton.disabled = true;

    const isCorrect = selectedAnswer === correctAnswer;
    answerStatus.textContent = isCorrect ? "Correct!" : "Not quite.";
    answerStatus.classList.add(isCorrect ? "correct" : "wrong");

    optionsGrid.querySelectorAll(".option-btn").forEach((btn) => {
        btn.disabled = true;
        if (btn.textContent === correctAnswer) {
            btn.classList.add("correct");
        }
        if (btn.textContent === selectedAnswer && !isCorrect) {
            btn.classList.add("wrong");
        }
    });

    userAnswerEl.textContent = selectedAnswer;
    correctAnswerEl.textContent = correctAnswer;
    explanationEl.textContent = explanationEl.dataset.explanation || "";
    resultPanel.classList.remove("hidden");

    requestAnimationFrame(() => {
        explanationEl.classList.add("visible");
    });
}

async function initSession(event) {
    event.preventDefault();

    const language = languageInput.value.trim();
    const chapters = parseChapters(chaptersInput.value);

    if (!language || chapters.length === 0) {
        setInitStatus("Please enter a language and at least one chapter.", true);
        return;
    }

    setInitStatus("Starting your session...");

    try {
        const response = await fetch("/api/learn/init", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                language,
                completedChapters: chapters
            })
        });

        if (!response.ok) {
            setInitStatus("Unable to start session. Try again.", true);
            return;
        }

        initPanel.classList.add("hidden");
        lessonPanel.classList.remove("hidden");
        await fetchQuestion();
    } catch (error) {
        setInitStatus("Network error. Please try again.", true);
    }
}

async function fetchQuestion() {
    resetAnswerState();
    questionText.textContent = "Loading question...";
    optionsGrid.innerHTML = "";

    try {
        const response = await fetch("/api/learn/question");
        const data = await response.json();

        if (!response.ok || !data.question) {
            questionText.textContent = "Unable to load question.";
            return;
        }

        currentQuestion = data.question;
        correctAnswer = data.correctAnswer;
        questionText.textContent = data.question;
        explanationEl.dataset.explanation = data.explanation || "No explanation provided.";
        renderOptions(data.options || []);
    } catch (error) {
        questionText.textContent = "Network error. Please try again.";
    }
}

function openDoubtPanel() {
    doubtPanel.classList.add("open");
    doubtOverlay.classList.add("open");
}

function closeDoubtPanel() {
    doubtPanel.classList.remove("open");
    doubtOverlay.classList.remove("open");
}

function appendMessage(text, type) {
    const bubble = document.createElement("div");
    bubble.className = `message-bubble ${type}`;
    bubble.textContent = text;
    doubtMessages.appendChild(bubble);
    doubtMessages.scrollTop = doubtMessages.scrollHeight;
}

async function submitDoubt(event) {
    event.preventDefault();

    const doubt = doubtInput.value.trim();
    if (!doubt) {
        return;
    }

    appendMessage(doubt, "message-user");
    doubtInput.value = "";

    try {
        const response = await fetch("/api/learn/explanation", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                question: currentQuestion,
                doubt
            })
        });

        const data = await response.json();
        const reply = data.answer || data.explanation || data.message || "No response available.";
        appendMessage(reply, "message-ai");
    } catch (error) {
        appendMessage("Unable to fetch explanation right now.", "message-ai");
    }
}

initForm.addEventListener("submit", initSession);
checkAnswerButton.addEventListener("click", revealAnswer);
nextQuestionButton.addEventListener("click", fetchQuestion);
openDoubtButton.addEventListener("click", openDoubtPanel);
closeDoubtButton.addEventListener("click", closeDoubtPanel);
doubtOverlay.addEventListener("click", closeDoubtPanel);
doubtForm.addEventListener("submit", submitDoubt);
