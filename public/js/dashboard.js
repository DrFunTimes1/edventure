const user = JSON.parse(localStorage.getItem("user"));

if (!user) {
    window.location.href = "login.html";
}

const welcomeText = document.getElementById("welcomeText");
const prediagStartButton = document.getElementById("prediagStartButton");
const prediagCard = document.getElementById("prediagCard");

if (welcomeText) {
    welcomeText.textContent = `Welcome back, ${user.name}`;
}

const surveyCompleted = localStorage.getItem("surveyCompleted") === "true";

if (surveyCompleted && prediagCard) {
    prediagCard.style.display = "none";
}

if (prediagStartButton) {
    prediagStartButton.addEventListener("click", () => {
        window.location.href = "prediag.html";
    });
}
