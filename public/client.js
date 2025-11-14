// persistent id
let persistentId = localStorage.getItem("client_id");
if (!persistentId) {
    persistentId = crypto.randomUUID();
    localStorage.setItem("client_id", persistentId);
}

// ui refs
const $roomLabel        = document.getElementById("room-label");
const $roundLabel       = document.getElementById("round-label");

const $menuPanel        = document.getElementById("menu-panel");
const $lobbyPanel       = document.getElementById("lobby-panel");
const $gamePanel        = document.getElementById("game-panel");

const $leaveBtn         = document.getElementById("leave-btn");
const $setNameBtn       = document.getElementById("setname-btn");
const $hostBtn          = document.getElementById("host-btn");
const $joinBtn          = document.getElementById("join-btn");
const $playBtn          = document.getElementById("play-btn");
const $sendBtn          = document.getElementById("send-btn");

const $usernameInput    = document.getElementById("username-input");
const $roomInput        = document.getElementById("room-input");
const $msgInput         = document.getElementById("msg-input");

const $playersList      = document.getElementById("players-list");
const $leaderList       = document.getElementById("leaderboard-list");

const $choicesContainer = document.getElementById("choices-container");
const $choiceA          = document.getElementById("choice-a");
const $choiceB          = document.getElementById("choice-b");

const $scoreList        = document.getElementById("score-list");
const $scoreBoard       = document.getElementById("scoreboard");

const $waitingMsg       = document.getElementById("waiting-msg");

const $logBox           = document.getElementById("log-box");

// helpers
const show = el => el.classList.remove("hidden");
const hide = el => el.classList.add("hidden");

function log(...args) {
    $logBox.textContent += args.join(" ") + "\n";
}

function gameOver() {
    $waitingMsg.textContent = "";
    $roundLabel.textContent = "Game over"
}

function renderScores(list) {
    $scoreList.innerHTML = "";
    for (const p of list) {
        const li = document.createElement("li");
        li.textContent = `${p.name}: ${p.score}`;
        $scoreList.appendChild(li);
    }
}

function renderPlayers(list) {
    $playersList.innerHTML = "";

    for (const p of list) {
        const li = document.createElement("li");
        const hostTag = p.isHost ? "(HOST) " : "";
        li.textContent = `${hostTag}${p.name}`;
        $playersList.appendChild(li);
    }
}

function enterGameMode() {
    hide($lobbyPanel);
    show($gamePanel);
}

function enterLobbyMode(roomCode) {
    if (roomCode) {
        $roomLabel.textContent = `Room: ${roomCode}`;
    }
    hide($menuPanel);
    show($lobbyPanel);
}

function exitLobbyMode() {
    show($menuPanel);
    hide($lobbyPanel);
    $roomLabel.textContent = "Room: ";
}

// establish websocket
const ws = new WebSocket(`ws://${location.host}`);

ws.onopen = () => {
    ws.send(JSON.stringify({
        type: "IDENTIFY",
        pid: persistentId
    }));
};

ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);

    switch (msg.type) {

        case "HOSTED":
            enterLobbyMode(msg.room);
            log("lobby created, room code:", msg.room);
            break;

        case "JOIN_ERROR":
            // re-enable host / play button if failed to join
            $hostBtn.disabled = false;
            $playBtn.disabled = false;

            log("join error:", msg.error);
            break;

        case "PLAY_ERROR":
            log("play error:", msg.error);
            break;

        case "HOST_ERROR":
            log("you already created a lobby on this page");
            break;

        case "PLAYING":
            enterGameMode();
            break;

        case "RECV_MSG":
            log(`from ${msg.from}:`, msg.payload);
            break;

        case "HOST_TRANSFERRED":
            log("you are now the host");
            break;

        case "PLAYER_LIST":
            renderPlayers(msg.players);
            enterLobbyMode(msg.room)
            break;

        case "LEFT_ROOM":
            log("you left the lobby");
            $roomInput.value = "";  // clear input
            exitLobbyMode();
            break;

        case "ROUND_START":
            $roundLabel.textContent = `round ${msg.round}`;
            show($choicesContainer);
            hide($waitingMsg);
            break;

        case "LEADERBOARD_UPDATE":
            renderScores(msg.leaderboard);
            break;

        case "GAME_OVER":
            renderScores(msg.leaderboard);
            gameOver()
            break;
    }
};

// ui events
$hostBtn.onclick = () => {
    ws.send(JSON.stringify({ type: "HOST_LOBBY" }));
};

$joinBtn.onclick = () => {
    const room = $roomInput.value.trim().toUpperCase();
    ws.send(JSON.stringify({ type: "JOIN_ROOM", room }));
};

$playBtn.onclick = () => {
    ws.send(JSON.stringify({ type: "PLAY" }));
};

$sendBtn.onclick = () => {
    const text = $msgInput.value;
    ws.send(JSON.stringify({ type: "SEND_MSG", payload: text }));
    log("sent:", text);
};

$setNameBtn.onclick = () => {
    let name = $usernameInput.value.trim();

    if (name.length > 16) {
        name = name.slice(0, 16);
        $usernameInput.value = name;
    }

    ws.send(JSON.stringify({
        type: "SET_NAME",
        name: name
    }));

    log("set username to:", name || "(auto)");
};

$leaveBtn.onclick = () => {
    ws.send(JSON.stringify({ type: "LEAVE_LOBBY" }));
};

$choiceA.onclick = () => {
    ws.send(JSON.stringify({ type: "ANSWER", choice: "A" }));
    show($waitingMsg);
};

$choiceB.onclick = () => {
    ws.send(JSON.stringify({ type: "ANSWER", choice: "B" }));
    show($waitingMsg);
};
