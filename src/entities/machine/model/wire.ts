/**
 * The wire protocol: names, and — only where the publisher said `carry` — the data beside them.
 * By default an application's data does not leave it; what crosses is the shape of the machine
 * and the path it took.
 *
 *   hail   a page asks who is out there
 *   hello  a machine states everything about itself
 *   step   one transition, and where it left the machine
 *   jump   the other way: put that machine at a slice
 *   bye    a machine has stopped publishing
 *
 * `hello` restates rather than continues, so order and delivery do not matter: a viewer that
 * missed anything hails and is whole again. A `step` carries `at` because a machine can be
 * restored from outside, so the target of a transition is not always where it now stands.
 */
import type { Row } from "../../../shared/lang/rules.js";
import type { Graph } from "./graph.js";

/** What a step carries beside its names, when the publisher chose to send it. */
export type Kept = {
  payload?: unknown;
  context?: unknown;
  emitted?: unknown;
};

/** One step as it crosses: the transition in names, the publisher's timestamp, the data. */
export type Went = { edge: Row; t: number; keep?: Kept };

export type Wire =
  | { say: "hail" }
  | {
      say: "hello";
      /** Which machine this is. One process may publish several. */
      who: string;
      /** What to call it on screen — the name the publisher was given, or its id. */
      name: string;
      /** A line about what the machine is for. Empty when nobody wrote one. */
      note: string;
      graph: Graph;
      at: string;
      /** Where in `steps` the machine stands — not the end of them, once walked back. */
      step: number;
      steps: Went[];
      /** What the application allows: `history` is true when a `History` was handed to `inspect`. */
      can: { history: boolean };
    }
  | { say: "step"; who: string; went: Went; at: string }
  /** The one message travelling the other way: put that machine at slice `step`. Ignored
      unless a `History` was handed over. */
  | { say: "jump"; who: string; step: number }
  | { say: "bye"; who: string };

/**
 * A gate, not a cast: anything can arrive on a socket. Checks only the shape each message needs
 * to be read; a `graph` stays `Record<string, unknown>` and its readers accept nonsense.
 */
export function isWire(msg: unknown): msg is Wire {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  const named = typeof m["who"] === "string";
  switch (m["say"]) {
    case "hail":
      return true;
    case "jump":
      return named && typeof m["step"] === "number";
    case "hello":
      return (
        named &&
        typeof m["name"] === "string" &&
        typeof m["can"] === "object" &&
        m["can"] !== null &&
        typeof m["note"] === "string" &&
        typeof m["at"] === "string" &&
        typeof m["step"] === "number" &&
        typeof m["graph"] === "object" &&
        m["graph"] !== null &&
        Array.isArray(m["steps"])
      );
    case "step":
      return (
        named &&
        typeof m["at"] === "string" &&
        typeof m["went"] === "object" &&
        m["went"] !== null
      );
    case "bye":
      return named;
    default:
      return false;
  }
}
