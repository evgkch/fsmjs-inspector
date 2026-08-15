/**
 * What one machine says about itself to a drawing somewhere else.
 *
 * The figure needs a graph, where the machine stands, and what it has done. All three are names:
 * `Graph` is what `JSON.stringify` left of a schema, and a step is drawn from the *types* of its
 * source, input, target and output — the contexts and payloads are never drawn anywhere. So the
 * wire carries names and nothing else, which is not a limitation but the same fact the whole tool
 * rests on, arriving one hop later.
 *
 * That has a consequence worth saying out loud: an application's data does not leave it. Whatever
 * is in a context — a session, a basket, a user — is not serialized, not sent, and cannot be seen
 * through this. What is sent is the shape of the machine and the path it took through it.
 *
 * Four sentences, and every one of them is complete on its own:
 *
 *   hail   a page has opened and does not know who is out there
 *   hello  a machine says what it is, what can be done to it, and everything it has done
 *   step   one transition, and where it left the machine
 *   jump   the other way down the wire: go back to a slice
 *   bye    a machine has stopped publishing
 *
 * `hello` restates rather than continues, so nothing has to be replayed and no order has to be
 * kept: a viewer that missed messages, or was not running yet, hails and is whole again. A `step`
 * carries `at` for the same reason — a machine can be restored from outside, and the target of a
 * transition is not always where the machine now is.
 */
import type { Edge } from "@evgkch/fsmjs";
import type { Graph } from "./graph.js";

/**
 * One step as it crosses: the transition in names, and when it happened.
 *
 * The time is the publisher's, taken where the step was taken. A reader's clock would say when the
 * page heard about it, which is a fact about the network.
 */
export type Went = { edge: Edge; t: number };

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
      /**
       * Where in `steps` the machine is standing — the end of them, unless somebody has walked it
       * back. Sent rather than assumed: a run that has been rewound looks exactly like one that
       * has not, and the difference is the whole reason to rewind.
       */
      step: number;
      steps: Went[];
      /**
       * What the application let the inspector do, and it is not a setting — it is a report of
       * what exists over there. `history` is here because a `History` was handed to `inspect`, and
       * a `History` is there because somebody wrote one: the inspector never conjures one up to
       * satisfy a flag, since a debugger that instruments a machine on its own behalf is a
       * debugger you cannot take out by deleting a line.
       */
      can: { history: boolean };
    }
  | { say: "step"; who: string; went: Went; at: string }
  /**
   * Back up the wire: put that machine at slice `step`.
   *
   * The only message that travels the other way, and the only thing this tool ever asks of an
   * application rather than hearing from it. It is refused unless a `History` was handed over,
   * which is the same thing as saying it is refused unless somebody meant it.
   */
  | { say: "jump"; who: string; step: number }
  | { say: "bye"; who: string };

/**
 * Is this one of ours?
 *
 * Anything at all can arrive on a socket, so this is a gate and not a cast. It checks the shape
 * each sentence needs to be read — no more: a `graph` is `Record<string, unknown>` by definition
 * and the reader below it is written for a schema that may be nonsense, which is the same reader
 * the editor uses on hand-typed JSON.
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
