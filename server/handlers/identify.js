
import { rooms } from "../rooms.js";
import { getPlayer, createPlayer } from "../players.js";
import { send, computeLeaderboard, broadcastPlayerList, generateDefaultName } from "../util.js";

export default function IDENTIFY(ws, msg) {
    const pid = msg.pid;
    let player = getPlayer(pid);

    // reconnect case
    if (player && !player.active) {
        player.ws = ws;
        player.active = true;
        player.lastSeen = Date.now();
        ws._pid = pid;

        if (player.room) {
            const room = rooms.get(player.room);
            const leaderboard = computeLeaderboard(room)
            if (room) {
                send(player, {
                    type: "RECONNECTED",
                    room: room.code,
                    round: room.round,
                    scores: room.scores,
                    answers: room.answers[pid],
                    result: room.result,
                    leaderboard
                });
                broadcastPlayerList(room);
            }
        }
        return;
    }

    // normal new player
    player = createPlayer(pid, ws, generateDefaultName());
    ws._pid = pid;

    return;
}