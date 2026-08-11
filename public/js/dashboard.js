(async () => {
    await checkLoggedIn();

    const user = await apiRequest("/api/auth/getUser");

    if (!user) {
        window.location.href = "login.html";
        return;
    }

    const welcomeText = document.getElementById("welcomeText");
    const dashboardTitle = document.getElementById("dashboardTitle");

    /* =========================
       WELCOME
    ========================= */

    const firstName =
        user.user?.fname ||
        user.fname ||
        "Explorer";

    if (welcomeText) {
        welcomeText.textContent =
            `Welcome back, ${firstName}!`;
    }

    if (dashboardTitle) {
        dashboardTitle.textContent =
            `Welcome back, ${firstName}!`;
    }

    /* =========================
       PROGRESS
       TEMPORARY VALUES.
    ========================= */

    const xp = 0;
    const xpForNextLevel = 1000;
    const level = 1;
    const streak = 0;

    const xpPercentage =
        Math.min(
            100,
            Math.round(
                (xp / xpForNextLevel) * 100
            )
        );


    const xpText =
        document.getElementById("xpText");

    const xpBar =
        document.getElementById("xpBar");

    const xpPercentageElement =
        document.getElementById("xpPercentage");

    const levelElement =
        document.getElementById("level");

    const streakElement =
        document.getElementById("currentStreak");


    if (xpText) {
        xpText.textContent =
            `${xp} / ${xpForNextLevel} XP`;
    }

    if (xpBar) {
        xpBar.style.width =
            `${xpPercentage}%`;
    }

    if (xpPercentageElement) {
        xpPercentageElement.textContent =
            `${xpPercentage}%`;
    }

    if (levelElement) {
        levelElement.textContent =
            level;
    }

    if (streakElement) {
        streakElement.textContent =
            streak;
    }

})();