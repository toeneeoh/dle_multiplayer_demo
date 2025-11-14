import http from "http";
import { WebSocketServer } from "ws";
import fs from "fs";
import path from "path";

let nextId = 1;
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
    const list = room.players.map((wsObj, idx) => ({
        id: wsObj._id,
        name: wsObj._name,
        isHost: idx === 0
    }));

    for (const peer of room.players) {
        peer.send(JSON.stringify({
            type: "PLAYER_LIST",
            players: list
        }));
    }
}

function computeLeaderboard(room) {
    const arr = [];

    for (const p of room.players) {
        arr.push({
            id: p._id,
            name: p._name,
            score: room.scores[p._id] || 0
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
        const pid = p._id;
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
    setTimeout(() => startRound(room), 1000);
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
    ws._id = nextId++;
    ws._room = null;
    ws._name = generateDefaultName(); // assigned on connect
    ws._createdLobby = false;

    console.log(`client ${ws._id} connected`);

    ws.send(JSON.stringify({
        type: "YOUR_ID",
        id: ws._id
    }));

    ws.on("message", raw => {
        const msg = JSON.parse(raw);

        // -------------------------------
        // HOST LOBBY
        // -------------------------------
        if (msg.type === "HOST_LOBBY") {
            // prevent re-hosting
            if (ws._createdLobby) {
                ws.send(JSON.stringify({
                    type: "HOST_ERROR",
                    error: "ALREADY_HOSTED"
                }));
                return;
            }

            // check if user is already in a room
            if (ws._room !== null) {
                ws.send(JSON.stringify({
                    type: "HOST_ERROR",
                    error: "ALREADY_IN_ROOM"
                }));
                return;
            }

            ws._createdLobby = true;

            const code = generateRoomCode();

            // setup room
            rooms.set(code, {
                _code: code,
                players: [ws],
                lobbyState: "open",
                dateStarted: formatDate(new Date()),
            });

            ws._room = code;

            broadcastPlayerList(rooms.get(code));

            ws.send(JSON.stringify({
                type: "HOSTED",
                room: code
            }));

            console.log(`client ${ws._id} hosted room ${code}`);
            return;
        }


        // -------------------------------
        // JOIN ROOM
        // -------------------------------
        if (msg.type === "JOIN_ROOM") {
            // reject if already in a room
            if (ws._room !== null) {
                ws.send(JSON.stringify({
                    type: "JOIN_ERROR",
                    error: "ALREADY_IN_ROOM"
                }));
                return;
            }

            const code = msg.room;
            const room = rooms.get(code);

            // reject if room not found
            if (!room) {
                ws.send(JSON.stringify({
                type: "JOIN_ERROR",
                error: "ROOM_NOT_FOUND"
                }));
                return;
            }

            // reject if lobby already started playing
            if (room.lobbyState === "playing") {
                ws.send(JSON.stringify({
                type: "JOIN_ERROR",
                error: "ROOM_PLAYING"
                }));
                return;
            }

            // add player to room
            room.players.push(ws);
            ws._room = code;

            broadcastPlayerList(rooms.get(code));

            console.log(`client ${ws._id} joined room ${code}`);
            return;
        }

        // -------------------------------
        // START GAME (PLAY)
        // -------------------------------
        if (msg.type === "PLAY") {
            const room = rooms.get(ws._room);
            if (!room)
                return;

            // reject if not host
            if (!isHost(ws, room)) {
                ws.send(JSON.stringify({
                type: "PLAY_ERROR",
                error: "NOT_HOST"
                }));
                return;
            }

            room.lobbyState = "playing";
            room.dateStarted = formatDate(new Date());

            // init game fields
            room.roundIndex = 0;
            room.scores = {};

            for (const p of room.players) {
                room.scores[p._id] = 0;
            }

            // broadcast transition into game mode
            for (const peer of room.players) {
                peer.send(JSON.stringify({
                    type: "PLAYING"
                }));
            }

            // begin first round
            console.log(`room ${ws._room} is now PLAYING`);
            startRound(room);
            return;
        }

        // -------------------------------
        // SEND MESSAGE TO ROOM
        // -------------------------------
        if (msg.type === "SEND_MSG" && ws._room) {
            const room = rooms.get(ws._room);
            for (const peer of room.players) {
                if (peer !== ws) {
                peer.send(JSON.stringify({
                    type: "RECV_MSG",
                    from: ws._id,
                    payload: msg.payload
                }));
                }
            }
            return;
        }

        // -------------------------------
        // SET USERNAME
        // -------------------------------
        if (msg.type === "SET_NAME") {
            let name = (msg.name || "").trim();

            // enforce name rules
            if (name.length === 0) {
                name = generateDefaultName();
            } else if (name.length > 16) {
                name = name.slice(0, 16);
            }

            ws._name = name;

            const room = rooms.get(ws._room);
            if (room) {
                broadcastPlayerList(room);
            }

            return;
        }

        // -------------------------------
        // LEAVE LOBBY
        // -------------------------------
        if (msg.type === "LEAVE_LOBBY") {
            const code = ws._room;
            if (!code || !rooms.has(code)) return;

            const room = rooms.get(code);
            const idx = room.players.indexOf(ws);

            if (idx !== -1) {
                room.players.splice(idx, 1);
            }

            ws._room = null;

            ws.send(JSON.stringify({
                type: "LEFT_ROOM"
            }));

            // delete room if empty
            if (room.players.length === 0) {
                rooms.delete(code);
                return;
            }

            // host transfer
            if (idx === 0) {
                const newHost = room.players[0];
                newHost.send(JSON.stringify({
                    type: "HOST_TRANSFERRED"
                }));
            }

            // broadcast updated player list
            broadcastPlayerList(room);

            return;
        }

        if (msg.type === "ANSWER") {
            const room = rooms.get(ws._room);
            if (!room || !room.roundActive) return;

            room.answers[ws._id] = msg.choice; // "A" or "B"

            // check if all players answered
            if (Object.keys(room.answers).length === room.players.length) {
                endRound(room);
            }
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
        console.log(`client ${ws._id} has left room ${code}`);

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

        console.log(`host of room ${code} is now client ${newHost._id}`);
    });
});

server.listen(8080, "0.0.0.0", () => {
    console.log("listening on http://localhost:8080");
});
