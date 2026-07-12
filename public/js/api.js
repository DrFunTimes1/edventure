async function apiRequest(endpoint, method = "GET", body = null) {
    const options = {
        method,
        credentials: "include",
        headers: {
            "Content-Type": "application/json"
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(endpoint, options);
    const responseText = await response.text();

    let data = {};

    if (responseText.trim()) {
        try {
            data = JSON.parse(responseText);
        } catch {
            data = { raw: responseText };
        }
    }

    if (!response.ok) {
        const err = new Error(data.error || data.raw || response.statusText || "Request failed");
        err.status = response.status;
        throw err;
    }

    return data;
}