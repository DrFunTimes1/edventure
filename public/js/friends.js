window.addEventListener(
    "DOMContentLoaded",
    loadFriends
);

async function loadFriends() {
    await checkLoggedIn();
    try {
        const data = await apiRequest(`/api/auth/getuser`);

        const user = data.user;

        if (!user) {
            window.location.replace("login.html");
            return;
        }

        document.getElementById(
            "myFriendCode"
        ).textContent = user.friend_code;

        const friendList =
            document.getElementById("friendList");

        friendList.innerHTML = "";

        const userFriends = await apiRequest(
            `/api/friends/getfriends?id=${user.id}`
        );

        if (!userFriends.friends || userFriends.friends.length === 0) {

            friendList.innerHTML = `
                <p class="noFriendsText">
                    No friends yet.
                </p>
            `;
            return;
        }

        userFriends.friends.forEach(friend => {
            console.log("FRIENDS FE: started panel creation (loop)");

            friendList.innerHTML += `
                <div class="friendCard">

                    <div class="friendInfo">

                        <h3>
                            ${friend.fname}
                        </h3>

                        <p>
                            ${friend.friend_code}
                        </p>

                    </div>

                    <button
                        class="friendButton"
                        onclick="viewFriend(${friend.id})"
                    >
                        View
                    </button>

                </div>
            `;
        });

    } catch (err) {
        console.error(err);
        alert("Failed to load friends");

    }

}

async function addFriend() {
    await checkLoggedIn();
    try {
        const friendCode =
            document
                .getElementById("friendCodeInput")
                .value
                .trim()
                .toUpperCase();

        if (!friendCode) {
            alert("Enter a friend code");
            return;
        }

        const user = JSON.parse(
            localStorage.getItem("user")
        );

        await apiRequest(
            "/api/friends/add",
            "POST",
            {
                userId: user.userId,
                friendCode: friendCode
            }
        );

        document.getElementById(
            "friendCodeInput"
        ).value = "";

        loadFriends();

    } catch (err) {

        console.error(err);

        alert(err.message);

    }
}

function viewFriend(friendId) {
    console.log("Viewing friend:", friendId);
}