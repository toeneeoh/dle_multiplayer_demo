import { rooms } from "../rooms.js";
import { getPlayer } from "../players.js";
import { broadcastPlayerList, allPlayersAnswered, endRound } from "../util.js";

export default function DISCONNECT(ws, msg) {
    const player = getPlayer(ws._pid);
    if (!player)
        return;

    player.active = false;
    player.ws = null;
    player.lastSeen = Date.now();

    const room = rooms.get(player.room);
    if (!room)
        return;

    broadcastPlayerList(room);

    // immediately start next round
    if (room.roundActive && allPlayersAnswered(room)) {
        endRound(room);
    }
}
