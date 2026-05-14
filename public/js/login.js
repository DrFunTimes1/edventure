async function login() {
    console.log(".../js/login.js loaded")
    try {
        const email = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPass").value.trim();

        if (!email || !password) {
            alert("Fill all fields");
            return;
        }

        const data = await apiRequest("/api/auth/login", "POST", {
            email,
            password
        });

        localStorage.setItem("user", JSON.stringify(data));

        window.location.replace("dashboard.html");

    } catch (err) {
        alert(err.message);
    }
}