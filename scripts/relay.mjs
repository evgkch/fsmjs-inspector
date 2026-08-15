/**
 * The wire, in the middle.
 *
 * An application with machines in it and a page drawing them are two clients; this is what lets
 * them find each other. It is a relay and not a server: every message that arrives is handed to
 * everyone else and to nobody twice, and that is the whole of it.
 *
 * It understands nothing it carries — it does not parse a message, does not know a hello from a
 * step, keeps no list of who is out there and no copy of what they said. That is deliberate. The
 * protocol is between the two ends: they restate rather than continue, so a relay that remembers
 * nothing loses nothing, and the one that has to be running for a debugger to work is the one with
 * the least in it that can be wrong.
 *
 *   node scripts/relay.mjs [port]
 */
import { WebSocketServer } from "ws";

const port = Number(process.argv[2] ?? process.env["PORT"] ?? 8999);
const wss = new WebSocketServer({ port });

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

console.log(`fsmjs inspector relay — ws://localhost:${port}`);
