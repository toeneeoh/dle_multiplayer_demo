import http from "http";
import { WebSocketServer } from "ws";
import fs from "fs";
import path from "path";

const DATA_FILE = "./rooms.json";
const MAX_ROUNDS = 10;

let rooms = new Map();

function storeGameRecord(room) {
    const record = {
        code: room._code,
        dateStarted: room.dateStarted,
        dateEnded: formatDate(new Date()),
        scores: room.scores
    };

    // append or maintain a history array
    let history = [];
    if (fs.existsSync(DATA_FILE)) {
        try {
            history = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
            if (!Array.isArray(history)) history = [];
        } catch {
            history = [];
        }
    }

    history.push(record);

    fs.writeFileSync(DATA_FILE, JSON.stringify(history, null, 2));
}

function formatDate(d) {
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const yr = d.getFullYear().toString().slice(-2);

    const hr = d.getHours().toString().padStart(2, "0");
    const min = d.getMinutes().toString().padStart(2, "0");

    return `${m}/${day}/${yr} ${hr}:${min}`;
}

// generate unique room code
function generateRoomCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code;
    do {
        code = Array.from({ length: 4 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
        ).join("");
    } while (rooms.has(code));
    return code;
}

// 
function broadcastPlayerList(room) {
    const list = room.players.map((ws, idx) => ({
        pid: ws._pid,
        name: ws._name,
        isHost: idx === 0
    }));

    for (const peer of room.players) {
        peer.send(JSON.stringify({
            type: "PLAYER_LIST",
            players: list,
            room: room
        }));
    }
}

function computeLeaderboard(room) {
    const arr = [];

    for (const p of room.players) {
        arr.push({
            pid: p._pid,
            name: p._name,
            score: room.scores[p._pid] || 0
        });
    }

    arr.sort((a, b) => b.score - a.score);
    return arr;
}

// assigned on connection
function generateDefaultName() {
    const adjectives = ["Red", "Blue", "Green", "Swift", "Bold", "Lucky", "Silent", "Tiny", "Brave"];
    const nouns = ["Sparrow", "Lion", "Otter", "Wolf", "Falcon", "Gator", "Bear", "Hawk", "Panda"];

    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 900 + 100);

    return `${adj}${noun}${num}`;
}

function startRound(room) {
    room.roundActive = true;
    room.answers = {};
    room.correctAnswer = Math.random() < 0.5 ? "A" : "B";
    room.roundIndex++;

    for (const peer of room.players) {
        peer.send(JSON.stringify({
            type: "ROUND_START",
            round: room.roundIndex,
            choices: ["A", "B"]
        }));
    }
}

function endRound(room) {
    room.roundActive = false;

    // tally scores
    for (const p of room.players) {
        const pid = p._pid;
        const ans = room.answers[pid];
        if (ans === room.correctAnswer) {
            room.scores[pid] = (room.scores[pid] || 0) + 1;
        }
    }

    // end game at MAX_ROUNDS
    if (room.roundIndex >= MAX_ROUNDS) {
        endGame(room);
        return;
    }

    const midLeaderboard = computeLeaderboard(room);

    // send leaderboard update
    for (const peer of room.players) {
        peer.send(JSON.stringify({
            type: "LEADERBOARD_UPDATE",
            leaderboard: midLeaderboard,
            round: room.roundIndex
        }));
    }

    // otherwise next round
    setTimeout(() => startRound(room), 5000);
}

function endGame(room) {
    const leaderboard = computeLeaderboard(room);

    // send game over update
    for (const peer of room.players) {
        peer.send(JSON.stringify({
            type: "GAME_OVER",
            leaderboard
        }));
    }

    storeGameRecord(room);

    // kill the room
    rooms.delete(room._code)
}

// HTTP static server
const server = http.createServer((req, res) => {
    const file = req.url === "/" ? "/index.html" : req.url;
    const filePath = path.join(process.cwd(), "public", file);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            return res.end("404");
        }
        res.end(data);
    });
});


// websocket logic
function isHost(ws, room) {
    return room.players[0] === ws;
}

const wss = new WebSocketServer({ server });

wss.on("connection", ws => {
    ws._pid = null;
    ws._room = null;
    ws._name = generateDefaultName(); // assigned on connect
    ws._createdLobby = false;

    ws.on("message", raw => {
        const msg = JSON.parse(raw);

        switch (msg.type) {

            case "IDENTIFY": {
                ws._pid = msg.pid;
                return;
            }

            case "HOST_LOBBY": {
                if (ws._createdLobby) {
                    ws.send(JSON.stringify({ type: "HOST_ERROR", error: "ALREADY_HOSTED" }));
                    return;
                }
                if (ws._room !== null) {
                    ws.send(JSON.stringify({ type: "HOST_ERROR", error: "ALREADY_IN_ROOM" }));
                    return;
                }

                ws._createdLobby = true;

                const code = generateRoomCode();
                rooms.set(code, {
                    _code: code,
                    players: [ws],
                    lobbyState: "open",
                    dateStarted: formatDate(new Date())
                });

                ws._room = code;
                broadcastPlayerList(rooms.get(code));

                ws.send(JSON.stringify({ type: "HOSTED", room: code }));
                console.log(`client ${ws._pid} hosted room ${code}`);
                return;
            }

            case "JOIN_ROOM": {
                if (ws._room !== null) {
                    ws.send(JSON.stringify({ type: "JOIN_ERROR", error: "ALREADY_IN_ROOM" }));
                    return;
                }

                const code = msg.room;
                const room = rooms.get(code);

                if (!room) {
                    ws.send(JSON.stringify({ type: "JOIN_ERROR", error: "ROOM_NOT_FOUND" }));
                    return;
                }
                if (room.lobbyState === "playing") {
                    ws.send(JSON.stringify({ type: "JOIN_ERROR", error: "ROOM_PLAYING" }));
                    return;
                }

                room.players.push(ws);
                ws._room = code;

                broadcastPlayerList(room);
                console.log(`client ${ws._pid} joined room ${code}`);
                return;
            }

            case "PLAY": {
                const room = rooms.get(ws._room);
                if (!room) return;

                if (!isHost(ws, room)) {
                    ws.send(JSON.stringify({ type: "PLAY_ERROR", error: "NOT_HOST" }));
                    return;
                }

                room.lobbyState = "playing";
                room.dateStarted = formatDate(new Date());
                room.roundIndex = 0;
                room.scores = {};

                for (const p of room.players) {
                    room.scores[p._pid] = 0;
                }

                for (const peer of room.players) {
                    peer.send(JSON.stringify({ type: "PLAYING" }));
                }

                console.log(`room ${ws._room} is now PLAYING`);
                startRound(room);
                return;
            }

            case "SEND_MSG": {
                if (!ws._room) return;

                const room = rooms.get(ws._room);
                for (const peer of room.players) {
                    if (peer !== ws) {
                        peer.send(JSON.stringify({
                            type: "RECV_MSG",
                            from: ws._pid,
                            payload: msg.payload
                        }));
                    }
                }
                return;
            }

            case "SET_NAME": {
                let name = (msg.name || "").trim();
                if (name.length === 0) name = generateDefaultName();
                if (name.length > 16) name = name.slice(0, 16);

                ws._name = name;

                const room = rooms.get(ws._room);
                if (room) broadcastPlayerList(room);

                return;
            }

            case "LEAVE_LOBBY": {
                const code = ws._room;
                if (!code || !rooms.has(code)) return;

                const room = rooms.get(code);
                const idx = room.players.indexOf(ws);

                if (idx !== -1) {
                    room.players.splice(idx, 1);
                }

                ws._room = null;

                ws.send(JSON.stringify({ type: "LEFT_ROOM" }));

                if (room.players.length === 0) {
                    rooms.delete(code);
                    return;
                }

                if (idx === 0) {
                    const newHost = room.players[0];
                    newHost.send(JSON.stringify({ type: "HOST_TRANSFERRED" }));
                }

                broadcastPlayerList(room);
                return;
            }

            case "ANSWER": {
                const room = rooms.get(ws._room);
                if (!room || !room.roundActive) return;

                room.answers[ws._pid] = msg.choice;

                if (Object.keys(room.answers).length === room.players.length) {
                    endRound(room);
                }
                return;
            }

            default:
                return;
        }
    });

    // on disconnect
    ws.on("close", () => {
        const code = ws._room;
        if (!code || !rooms.has(code)) return;
        
        const room = rooms.get(code);
        const idx = room.players.indexOf(ws);

        if (idx !== -1) room.players.splice(idx, 1);
        console.log(`client ${ws._pid} has left room ${code}`);

        if (room.players.length > 0) {
            broadcastPlayerList(room);

        // delete room if empty
        } else {
            console.log(`room ${code} is closed`);
            rooms.delete(code);
            return;
        }

        // otherwise new host = player[0]
        const newHost = room.players[0];

        newHost.send(JSON.stringify({
            type: "HOST_TRANSFERRED"
        }));

        console.log(`host of room ${code} is now client ${newHost._pid}`);
    });
});

server.listen(8080, "0.0.0.0", () => {
    console.log("listening on http://localhost:8080");
});
