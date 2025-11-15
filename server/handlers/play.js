
import { rooms } from "../rooms.js";
import { getPlayer } from "../players.js";
import { send, startRound, isHost } from "../util.js";

export default function PLAY(ws, msg) {
    const player = getPlayer(ws._pid);
    if (!player)
        return;

    const room = rooms.get(player.room);
    if (!room)
        return;

    if (!isHost(player, room)) {
        send(player, { type: "PLAY_ERROR", error: "NOT_HOST" });
        return;
    }

    room.lobbyState = "playing";

    // initialize room variables
    for (const p of room.players) {
        room.scores[p.pid] = 0;
        room.answers[p.pid] = [];
        send(p, { type: "PLAYING" })
    }

    console.log(`room ${room.code} is now PLAYING`);
    startRound(room);
    return;
}
