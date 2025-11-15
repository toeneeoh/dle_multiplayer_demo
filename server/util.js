import { rooms } from "./rooms.js";
import fs from "fs";

const MAX_ROUNDS = 10;
const DATA_FILE = "../rooms.json";

export function send(p, obj) {
    if (!p.active || !p.ws)
        return;

    p.ws.send(JSON.stringify(obj));
}

export function broadcast(room, obj) {
    const str = JSON.stringify(obj);
    for (const p of room.players) {
        if (p.active && p.ws) p.ws.send(str);
    }
}

export function broadcastPlayerList(room) {
    const list = room.players.map((p, idx) => ({
        pid: p.pid,
        name: p.name,
        active: p.active,
        isHost: idx === 0,
    }));

    broadcast(room, {
        type: "PLAYER_LIST",
        players: list,
        room: room.code,
        lobbyState: room.lobbyState
    });
}

export function sendPlayerList(room) {
    const players = room.players.map((p, i)=>({
        pid: p.pid,
        name: p.name,
        active: p.active,
        isHost: i===0
    }));

    broadcast(room, { type:"PLAYER_LIST", players });
}

export function allPlayersAnswered(room) {
    for (const p of room.players) {
        if (!p.active)
            continue;
        if (!room.answers[p.pid][room.round]) {
            return false; // active player missing answer
        }
    }

    return true;
}

export function isHost(player, room) {
    return room.players[0] === player;
}

function getRandomResult() {
    return Math.random() < 0.5 ? "A" : "B";
}

export function startRound(room) {
    room.roundActive = true;
    let result = getRandomResult();
    room.result.push(result)

    for (const p of room.players) {
        send(p, { type: "ROUND_START", round: room.round, choices: ["A", "B"] })
    }
}

export function endRound(room) {
    if (!room.roundActive)
        return;
    room.roundActive = false;

    // tally scores
    for (const p of room.players) {
        const pid = p.pid;
        let ans = room.answers[pid][room.round]

        // generate a random answer for disconnected players
        if (!ans) {
            ans = getRandomResult();
            room.answers[p.pid].push(ans);
        }
        if (ans === room.result[room.round]) {
            room.scores[pid] = (room.scores[pid] || 0) + 1;
        }
    }

    const leaderboard = computeLeaderboard(room);

    // send leaderboard update
    for (const p of room.players) {
        send(p, {
            type: "LEADERBOARD_UPDATE",
            round: room.round,
            answers: room.answers[p.pid],
            result: room.result,
            leaderboard,
        });
    }

    // otherwise next round
    room.round++;

    // end game at MAX_ROUNDS
    if (room.round >= MAX_ROUNDS) {
        setTimeout(() => endGame(room), 5000);
        return;
    }

    setTimeout(() => startRound(room), 5000);
}

// assigned on connection
export function generateDefaultName() {
    const adjectives = ["Red", "Blue", "Green", "Swift", "Bold", "Lucky", "Silent", "Tiny", "Brave"];
    const nouns = ["Sparrow", "Lion", "Otter", "Wolf", "Falcon", "Gator", "Bear", "Hawk", "Panda"];

    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 900 + 100);

    return `${adj}${noun}${num}`;
}

export function computeLeaderboard(room) {
    const arr = [];

    for (const p of room.players) {
        arr.push({
            pid: p.pid,
            name: p.name,
            score: room.scores[p.pid] || 0
        });
    }

    arr.sort((a, b) => b.score - a.score);
    return arr;
}

// generate unique room code
export function generateRoomCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code;
    do {
        code = Array.from({ length: 4 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
        ).join("");
    } while (rooms.has(code));
    return code;
}

function formatDate(d) {
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const yr = d.getFullYear().toString().slice(-2);

    const hr = d.getHours().toString().padStart(2, "0");
    const min = d.getMinutes().toString().padStart(2, "0");

    return `${m}/${day}/${yr} ${hr}:${min}`;
}

export function storeGameRecord(room) {
    const record = {
        code: room.code,
        dateStarted: room.dateStarted,
        dateEnded: formatDate(new Date()),
        scores: room.scores,
        answers: room.answers,
        result: room.result
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

export function endGame(room) {
    const leaderboard = computeLeaderboard(room);

    for (const p of room.players) {
        send(p, {
            type: "LEADERBOARD_UPDATE",
            round: room.round,
            answers: room.answers[p.pid],
            result: room.result,
            leaderboard,
        });
    }

    storeGameRecord(room);

    // send game over update
    broadcast(room, {
        type: "GAME_OVER",
        leaderboard
    })

    // kill the room
    rooms.delete(room.code)
}
