export const players = new Map();

export function getPlayer(pid) {
    return players.get(pid);
}

export function createPlayer(pid, ws, defaultName) {
    const p = {
        pid,
        ws,
        name: defaultName,
        room: null,
        active: true,
        lastSeen: Date.now()
    };
    players.set(pid, p);
    return p;
}
