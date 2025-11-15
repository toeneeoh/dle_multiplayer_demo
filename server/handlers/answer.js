import { rooms } from "../rooms.js";
import { getPlayer } from "../players.js";
import { allPlayersAnswered, endRound } from "../util.js";

export default function ANSWER(ws, msg) {
    const player = getPlayer(ws._pid);
    if (!player || !player.active)
        return;

    const room = rooms.get(player.room);
    if (!room || !room.roundActive)
        return;

    // check if already answered
    if (room.answers[player.pid][room.round]) {
        console.log("You already selected an answer.");
        return;
    }

    room.answers[player.pid].push(msg.choice);

    if (room.roundActive && allPlayersAnswered(room))
        endRound(room);

    return;
}
