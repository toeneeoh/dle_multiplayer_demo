import { rooms } from "../rooms.js";
import { getPlayer } from "../players.js";
import { send, broadcastPlayerList } from "../util.js";

export default function LEAVE_LOBBY(ws, msg) {
    const player = getPlayer(ws._pid);
    if (!player)
        return;

    const room = rooms.get(player.room);
    if (!room)
        return;

    // only allowed when NOT playing
    if (room.lobbyState === "playing") {
        send(player, { type: "LEAVE_ERROR", error: "CANNOT_LEAVE_DURING_GAME" });
        return;
    }

    // remove from room entirely
    const idx = room.players.indexOf(player);
    if (idx !== -1) {
        room.players.splice(idx, 1);
    }

    player.room = null;

    send(player, { type: "LEFT_ROOM" });

    // if room empty then delete room
    if (room.players.length === 0) {
        rooms.delete(room.code);
        return;
    }

    // host transfer if host left
    if (idx === 0) {
        const newHost = room.players[0];
        send(newHost, { type: "HOST_TRANSFERRED" });
    }

    broadcastPlayerList(room);
    return;
}
