/**
 * The page that watches, started.
 *
 * The other entry starts the standalone page; this one starts the viewer. Two pages and one tool:
 * everything below this line is shared, and what differs is what the subject can do.
 */
import "../shared/ui/tokens.css";
import { viewer } from "../pages/viewer/index.js";

console.log(
  "%cfsmjs inspector%c\n" +
    "Inspecting machines that are running somewhere else. An application writes one line —\n" +
    "`const fsm = inspect(fsm, { name })` — and a relay carries what it says to this page.\n" +
    "Names cross the wire: no context, no payload, nothing an application holds.\n" +
    "https://github.com/evgkch/fsmjs-inspector",
  "font-weight:700",
  "font-weight:400",
);

viewer();
