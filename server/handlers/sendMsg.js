import { rooms } from "../rooms.js";
import { getPlayer } from "../players.js";
import { send } from "../util.js";

export default function SEND_MSG(ws, msg) {
    const player = getPlayer(ws._pid);
    if (!player)
        return;

    const room = rooms.get(player.room);
    if (!room)
        return;

    for (const p of room.players) {
        if (p !== player) {
            send(p, {
                type: "RECV_MSG",
                from: player.pid,
                name: player.name,
                payload: msg.payload
            })
        }
    }
    return;
}
