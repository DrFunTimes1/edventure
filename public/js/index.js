(async () => {
	try {
		await apiRequest("/api/session/open", "POST", {});
		await apiRequest("/api/auth/getUser");
		window.location.replace("dashboard.html");
	} catch (err) {
		if (err.status !== 401) {
			console.error("Failed to initialize the session:", err);
		}
	}
})();