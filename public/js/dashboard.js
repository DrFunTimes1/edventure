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

    const streak = 0;

    const streakElement =
        document.getElementById("currentStreak");

    await loadXpState();

    if (streakElement) {
        streakElement.textContent =
            streak;
    }

})();