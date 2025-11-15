export const rooms = new Map();

export function createRoom(code, host) {
    const room = {
        code,
        players: [host],
        lobbyState: "open",
        round: 0,
        roundActive: false,
        scores: {},
        answers: {},
        result: [],
        dateStarted: null
    };
    rooms.set(code, room);
    return room;
}

export function getRoom(code) {
    return rooms.get(code);
}