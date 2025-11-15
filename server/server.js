import http from "http";
import { WebSocketServer } from "ws";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as handlers from "./handlers/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, "..", "public");

const server = http.createServer((req, res) => {
    const file = req.url === "/" ? "/index.html" : req.url;
    const filePath = path.join(PUBLIC_DIR, file);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            return res.end("404");
        }
        res.end(data);
    });
});

const wss = new WebSocketServer({ server });

wss.on("connection", ws => {
    ws.on("message", raw => {
        const msg = JSON.parse(raw);
        const type = msg.type;

        const handler = handlers[type];
        if (handler)
            handler(ws, msg);
    });

    ws.on("close", () => handlers.DISCONNECT(ws));
});

server.listen(8080, "0.0.0.0", () =>
    console.log("listening on http://localhost:8080")
);
