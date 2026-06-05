async function signup() {
    try {
        const fname = document.getElementById("signupFName").value.trim();
        const lname = document.getElementById("signupLName").value.trim();
        const email = document.getElementById("signupEmail").value.trim();
        const unhashedpw = document.getElementById("signupPass").value.trim();

        await apiRequest("/api/auth/signup", "POST", {
            fname,
            lname,
            email,
            unhashedpw
        });

        alert("Account created successfully.");

        window.location.href = "login.html";

    } catch (err) {
        alert(err.message);
    }
}