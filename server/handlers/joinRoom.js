import { rooms } from "../rooms.js";
import { getPlayer } from "../players.js";
import { send, broadcastPlayerList } from "../util.js";

export default function JOIN_ROOM(ws, msg) {
    const player = getPlayer(ws._pid);
    if (!player)
        return;

    if (player.room) {
        send(player, { type: "JOIN_ERROR", error: "ALREADY_IN_ROOM" });
        return;
    }

    const room = rooms.get(msg.room);
    if (!room) {
        send(player, { type: "JOIN_ERROR", error: "ROOM_NOT_FOUND" });
        return;
    }

    if (room.lobbyState === "playing") {
        send(player, { type: "JOIN_ERROR", error: "ROOM_PLAYING" });
        return;
    }

    room.players.push(player);
    player.room = room.code;
    player.active = true;

    broadcastPlayerList(room);
    return;
}
