import { createRoom } from "../rooms.js";
import { players } from "../players.js";
import { send, sendPlayerList, generateRoomCode } from "../util.js";

export default function HOST_LOBBY(ws, msg) {
    const player = players.get(ws._pid);
    if (!player) return;

    if (player.room) {
        send(player, { type: "HOST_ERROR", error: "ALREADY_IN_ROOM" })
        return;
    }

    const code = generateRoomCode();
    const room = createRoom(code, player);

    player.room = code;
    room.dateStarted = new Date();

    send(player, { type: "HOSTED", room: code });
    sendPlayerList(room);
}
