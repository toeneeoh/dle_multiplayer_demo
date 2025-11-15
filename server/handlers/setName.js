import { rooms } from "../rooms.js";
import { getPlayer } from "../players.js";
import { generateDefaultName, broadcastPlayerList } from "../util.js";

export default function SET_NAME(ws, msg) {
    const player = getPlayer(ws._pid);
    if (!player)
        return;

    let name = (msg.name || "").trim();

    if (name.length === 0)
        name = generateDefaultName();

    if (name.length > 16)
        name = name.slice(0, 16);

    player.name = name;

    const room = rooms.get(player.room);
    if (room)
        broadcastPlayerList(room);

    return;
}
