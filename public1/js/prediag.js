let selectedAnswer = null;
let isLoading = false;
let questionCount = 0;
const maxQuestions = 10;
let currentQuestionNumber = 0;
let currentQuestionData = null;
const questionHistory = [];

const questionText = document.getElementById("questionText");
const optionsGrid = document.getElementById("optionsGrid");
const submitAnswer = document.getElementById("submitAnswer");
const feedback = document.getElementById("feedback");
const initForm = document.getElementById("initForm");
const initCard = document.getElementById("initCard");
const initSubmit = document.getElementById("initSubmit");
const initFeedback = document.getElementById("initFeedback");
const gradeInput = document.getElementById("gradeInput");
const chaptersInput = document.getElementById("chaptersInput");
const questionSection = document.getElementById("questionSection");
const summaryOverlay = document.getElementById("summaryOverlay");
const summaryList = document.getElementById("summaryList");
const summaryClose = document.getElementById("summaryClose");

function setLoading(state) {
    isLoading = state;
    submitAnswer.disabled = state || !selectedAnswer;
}

function clearFeedback() {
    feedback.textContent = "";
    feedback.classList.remove("correct");
    feedback.classList.remove("wrong");
}

function setInitFeedback(message, isError = false) {
    initFeedback.textContent = message;
    initFeedback.classList.toggle("wrong", isError);
}

function handleSessionExpired(response, messageTarget) {
    if (response.status !== 401 && response.status !== 403) {
        return false;
    }

    if (messageTarget) {
        messageTarget.textContent = "Session expired. Redirecting...";
        messageTarget.classList.add("wrong");
    }

    setTimeout(() => {
        window.location.href = "dashboard.html";
    }, 1200);

    return true;
}

function endSurvey() {
    localStorage.setItem("surveyCompleted", "true");
    questionText.textContent = "Survey completed. Your baseline is ready.";
    optionsGrid.innerHTML = "";
    submitAnswer.disabled = true;
    feedback.textContent = "You can return to the dashboard.";
    feedback.classList.add("completionNotice");
    showSummaryOverlay();
}

function showSummaryOverlay() {
    if (!summaryOverlay || !summaryList) {
        return;
    }

    summaryList.innerHTML = "";

    questionHistory.forEach((entry) => {
        const card = document.createElement("div");
        card.className = "summaryQuestionCard";

        const title = document.createElement("div");
        title.className = "summaryQuestionTitle";
        title.textContent = `Q${entry.qno}. ${entry.text}`;
        card.appendChild(title);

        const options = document.createElement("div");
        options.className = "summaryOptions";

        entry.options.forEach((optionText) => {
            const optionEl = document.createElement("div");
            optionEl.className = "summaryOption";
            optionEl.textContent = optionText;

            const isSelected = optionText === entry.selected;
            const correctAnswer = entry.correctAnswer || (entry.correct ? entry.selected : null);
            const isCorrect = correctAnswer && optionText === correctAnswer;

            if (isCorrect) {
                optionEl.classList.add("correct");
            }
            if (isSelected && !entry.correct) {
                optionEl.classList.add("wrong");
            }
            if (isSelected && entry.correct) {
                optionEl.classList.add("selected");
            }

            options.appendChild(optionEl);
        });

        card.appendChild(options);

        const explainRow = document.createElement("div");
        explainRow.className = "summaryExplainRow";

        const explainButton = document.createElement("button");
        explainButton.className = "summaryExplainButton";
        explainButton.type = "button";
        explainButton.textContent = "Explain";

        const explainContent = document.createElement("div");
        explainContent.className = "summaryExplainContent";

        explainButton.addEventListener("click", () => {
            toggleExplanation(entry, explainContent, explainButton);
        });

        explainRow.appendChild(explainButton);
        card.appendChild(explainRow);
        card.appendChild(explainContent);

        summaryList.appendChild(card);
    });

    summaryOverlay.style.display = "flex";
    document.body.classList.add("overlayOpen");
}

function closeSummaryOverlay() {
    if (!summaryOverlay) {
        return;
    }

    summaryOverlay.style.display = "none";
    document.body.classList.remove("overlayOpen");
}

async function toggleExplanation(entry, contentEl, buttonEl) {
    const isOpen = contentEl.classList.contains("open");

    if (isOpen) {
        contentEl.classList.remove("open");
        contentEl.textContent = "";
        return;
    }

    contentEl.classList.add("open");
    contentEl.textContent = "Loading explanation...";

    try {
        const response = await fetch(`/api/prediag/explain?qno=${entry.qno}`, {
            credentials: "same-origin"
        });

        if (handleSessionExpired(response, contentEl)) {
            return;
        }

        const payloadText = await response.text();
        let payload = null;

        try {
            payload = JSON.parse(payloadText);
        } catch (error) {
            payload = null;
        }

        const explanationText = payload?.explanation || payload?.answer || payload?.message || payloadText;
        contentEl.textContent = explanationText || "No explanation available.";
    } catch (error) {
        contentEl.textContent = "Unable to load explanation.";
    }
}


async function fetchQuestion() {
    if (questionCount >= maxQuestions) {
        endSurvey();
        return;
    }

    setLoading(true);
    clearFeedback();
    questionText.textContent = "Loading question...";
    optionsGrid.innerHTML = "";
    selectedAnswer = null;

    try {
        const response = await fetch("/api/prediag/question", {
            credentials: "same-origin"
        });

        if (handleSessionExpired(response, feedback)) {
            return;
        }
        const data = await response.json();

        if (!response.ok || !data.question) {
            questionText.textContent = "Unable to load question.";
            setLoading(false);
            return;
        }

        questionText.textContent = data.question.text;
        currentQuestionData = {
            text: data.question.text,
            options: data.question.options,
            correctAnswer: data.question.correctAnswer || null
        };
        currentQuestionNumber = questionCount + 1;

        data.question.options.forEach((optionText) => {
            const button = document.createElement("button");
            button.className = "optionButton";
            button.textContent = optionText;
            button.addEventListener("click", () => selectOption(button, optionText));
            optionsGrid.appendChild(button);
        });
    } catch (error) {
        questionText.textContent = "Network error. Please try again.";
    } finally {
        setLoading(false);
    }
}

function selectOption(button, optionText) {
    if (isLoading) {
        return;
    }

    selectedAnswer = optionText;
    submitAnswer.disabled = false;

    document.querySelectorAll(".optionButton").forEach((btn) => {
        btn.classList.remove("selected");
    });

    button.classList.add("selected");
}

async function submitCurrentAnswer() {
    if (!selectedAnswer || isLoading) {
        return;
    }

    setLoading(true);
    clearFeedback();

    try {
        const response = await fetch("/api/prediag/question", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                answer: selectedAnswer
            })
        });

        if (handleSessionExpired(response, feedback)) {
            return;
        }

        const result = await response.json();

        if (!response.ok || typeof result.correct !== "boolean") {
            feedback.textContent = "Unable to check answer.";
            feedback.classList.add("wrong");
            setLoading(false);
            return;
        }

        questionCount += 1;

        if (currentQuestionData) {
            questionHistory.push({
                qno: currentQuestionNumber,
                text: currentQuestionData.text,
                options: currentQuestionData.options,
                selected: selectedAnswer,
                correct: result.correct,
                correctAnswer: currentQuestionData.correctAnswer
            });
        }

        if (result.correct) {
            feedback.textContent = "Correct!";
            feedback.classList.add("correct");
        } else {
            feedback.textContent = "Incorrect.";
            feedback.classList.add("wrong");
        }

        selectedAnswer = null;
        submitAnswer.disabled = true;

        setTimeout(fetchQuestion, 800);
    } catch (error) {
        feedback.textContent = "Network error. Please try again.";
        feedback.classList.add("wrong");
    } finally {
        setLoading(false);
    }
}

async function submitInitDetails(event) {
    event.preventDefault();

    if (!gradeInput || !chaptersInput) {
        return;
    }

    const gradeValue = Number(gradeInput.value);
    const chaptersRaw = chaptersInput.value;
    const chapterList = chaptersRaw
        .split(",")
        .map((entry) => Number(entry.trim()))
        .filter((value) => Number.isInteger(value) && value > 0);

    if (!Number.isInteger(gradeValue) || gradeValue < 1 || chapterList.length === 0) {
        setInitFeedback("Please enter a valid grade (number) and at least one chapter.", true);
        return;
    }

    initSubmit.disabled = true;
    setInitFeedback("Submitting details...");

    try {
        const response = await fetch("/api/prediag/initDetails", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                grade: gradeValue,
                completedChapters: chapterList
            })
        });

        if (handleSessionExpired(response, initFeedback)) {
            return;
        }

        if (!response.ok) {
            setInitFeedback("Unable to start. Please try again.", true);
            initSubmit.disabled = false;
            return;
        }

        if (initCard) {
            initCard.style.display = "none";
        }
        if (questionSection) {
            questionSection.style.display = "flex";
        }

        fetchQuestion();
    } catch (error) {
        setInitFeedback("Network error. Please try again.", true);
        initSubmit.disabled = false;
    }
}

submitAnswer.addEventListener("click", submitCurrentAnswer);

if (questionSection) {
    questionSection.style.display = "none";
}


if (initForm) {
    initForm.addEventListener("submit", submitInitDetails);
}

if (summaryClose) {
    summaryClose.addEventListener("click", closeSummaryOverlay);
}

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && summaryOverlay?.style.display === "flex") {
        closeSummaryOverlay();
    }
});