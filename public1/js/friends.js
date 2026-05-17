window.addEventListener(
    "DOMContentLoaded",
    loadFriends
);

async function loadFriends() {

    try {

        const user = JSON.parse(
            localStorage.getItem("user")
        );

        if (!user) {
            window.location.replace("login.html");
            return;
        }

        const data = await apiRequest(`/api/friends/getfriends?id=${user.userId}`);

        document.getElementById(
            "myFriendCode"
        ).textContent = data.friend_code;

        const friendList =
            document.getElementById("friendList");

        friendList.innerHTML = "";

        if (data.friends.length === 0) {

            friendList.innerHTML = `
                <p class="noFriendsText">
                    No friends yet.
                </p>
            `;
            return;
        }

        data.friends.forEach(friend => {

            console.log("started panel creation (loop)")

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

        // clear input
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

    console.log(
        "Viewing friend:",
        friendId
    );
}