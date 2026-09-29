const userName = document.getElementById("userName");
const userEmail = document.getElementById("userEmail");
const avatar = document.getElementById("avatar");

const grade = document.getElementById("grade");
const lessonsDone = document.getElementById("lessonsDone");
const mastery = document.getElementById("mastery");

const fullName = document.getElementById("fullName");
const email = document.getElementById("email");
const friendCode = document.getElementById("friendCode");

const tierBadge = document.getElementById("tierBadge");
const learningTier = document.getElementById("learningTier");

const masteryBar = document.getElementById("masteryBar");
const masteryText = document.getElementById("masteryText");

const errorMessage = document.getElementById("errorMessage");


function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = "block";
}


function getDisplayName(user) {
    const first = String(user?.fname ?? "").trim();
    const last = String(user?.lname ?? "").trim();

    const name = `${first} ${last}`.trim();

    return name || "Student";
}


function calculateMastery(data) {
    if (!data || typeof data !== "object") {
        return 0;
    }

    const scores = Object.values(data)
        .map(entry => {
            if (typeof entry === "number") {
                return entry;
            }

            if (entry && typeof entry === "object") {
                return Number(entry.score);
            }

            return NaN;
        })
        .filter(Number.isFinite);

    if (!scores.length) {
        return 0;
    }

    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}


async function loadProfile() {

    try {

        await loadXpState();

        const [userResponse, statusResponse] = await Promise.all([
            fetch("/api/auth/getUser", {
                credentials: "include"
            }),

            fetch("/api/learn/status", {
                credentials: "include"
            })
        ]);


        if (!userResponse.ok) {
            throw new Error("Could not load account information.");
        }

        if (!statusResponse.ok) {
            throw new Error("Could not load learning information.");
        }


        const userData = await userResponse.json();
        const statusData = await statusResponse.json();


        console.log("[PROFILE.JS] User:", userData);
        console.log("[PROFILE.JS] Learning status:", statusData);


        /*
         * Some getUser implementations return:
         *
         * { user: {...} }
         *
         * while others return the user object directly.
         *
         * Support both.
         */

        const user = userData.user || userData;


        const name = getDisplayName(user);

        userName.textContent = name;
        fullName.textContent = name;

        userEmail.textContent = user.email || "No email";
        email.textContent = user.email || "No email";

        friendCode.textContent =
            user.friend_code ||
            user.friendCode ||
            "Not available";


        const firstLetter =
            name.charAt(0).toUpperCase() || "?";

        avatar.textContent = firstLetter;


        const currentGrade =
            statusData.grade ??
            user.grade ??
            "--";

        grade.textContent = currentGrade;


        const completed =
            statusData.lessonHistoryCount ??
            statusData.lessonsDone ??
            0;

        lessonsDone.textContent = completed;


        const tier =
            statusData.tier ||
            "C";

        tierBadge.textContent = tier;
        learningTier.textContent = tier;


        /*
         * /status currently doesn't expose mastery directly.
         *
         * If it does in the future, use it.
         * Otherwise leave mastery at 0 instead of
         * pretending we know the student's score.
         */

        const masteryValue =
            calculateMastery(statusData.mastery);

        const masteryPercent =
            Math.round(masteryValue * 100);

        mastery.textContent = `${masteryPercent}%`;
        masteryText.textContent = `${masteryPercent}% mastery`;
        masteryBar.style.width = `${masteryPercent}%`;


    } catch (err) {

        console.error("[PROFILE.JS]", err);

        showError(
            err.message ||
            "Something went wrong while loading your profile."
        );

    }
}

loadProfile();