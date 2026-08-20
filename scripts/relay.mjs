/**
 * The relay: every message that arrives is handed to every other client, and nothing else. It
 * parses nothing and stores nothing — the protocol restates rather than continues, so a relay
 * that remembers nothing loses nothing.
 *
 *   node scripts/relay.mjs [port]
 */
import { WebSocketServer } from "ws";

const port = Number(process.argv[2] ?? process.env["PORT"] ?? 8999);
const wss = new WebSocketServer({ port });

wss.on("error", (err) => {
  // A relay from an earlier run is already listening on this port. One line instead of a stack
  // trace, and exit 0: the relay this script was asked for is running.
  if (err.code === "EADDRINUSE") {
    console.log(`fsmjs inspector relay — ws://localhost:${port} (already up)`);
    process.exit(0);
  }
  throw err;
});

// Printed on `listening`, not at startup: on a busy port the listen fails after the constructor
// returns, and a line printed earlier would be wrong.
wss.on("listening", () => {
  console.log(`fsmjs inspector relay — ws://localhost:${port}`);
});

wss.on("connection", (sock) => {
  sock.on("message", (data, binary) => {
    for (const other of wss.clients)
      if (other !== sock && other.readyState === 1)
        other.send(data, { binary });
  });
  // A client that goes away takes nothing with it. Whoever is left says what they are again the
  // next time they are asked, which is what makes that true.
  sock.on("error", () => sock.close());
});
