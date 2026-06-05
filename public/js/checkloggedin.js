async function checkLoggedIn(){
    try{
        const data = await apiRequest('/api/auth/getUser')
    } catch (e) {
        if (e.status === 401){
            window.location.replace("/login.html");
            return;
        }
    }
    return;
}