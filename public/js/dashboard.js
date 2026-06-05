(async () => {
    await checkLoggedIn();
    const user = await apiRequest("/api/auth/getUser")
    console.log(user);

    if (!user) {
        window.location.href = "login.html";
    }

    const welcomeText = document.getElementById("welcomeText");
    const prediagStartButton = document.getElementById("prediagStartButton");
    console.log("button:", prediagStartButton);

    const prediagCard = document.getElementById("prediagCard");

    if (welcomeText) {
        welcomeText.textContent = `Welcome back, ${user.user.fname}!`;
    }

    const surveyCompleted = localStorage.getItem("surveyCompleted") === "true";

    // if (surveyCompleted && prediagCard) {
    //     prediagCard.style.display = "none";
    // }

    if (prediagStartButton) {
        prediagStartButton.addEventListener("click", () => {
            window.location.replace("prediag.html");
        });
    }
})();

