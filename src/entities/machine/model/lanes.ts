/**
 * One colour per state, and the same one wherever that state is written.
 *
 * The figure gives every state a lane and colours its column, its row and its cells by it. The
 * editor writes the same states as words, and the reading and the history write them again. If
 * each of those picked its own colour they would agree by accident and disagree by drift, so
 * there is one order and one function, and everything asks them.
 *
 * The order is the one a run meets the states in: `analyze` fills `reachable` breadth-first from
 * the start, so the near states are near the origin and the ones nothing reaches come last, where
 * their empty column is easy to see.
 */
import { analyze } from "@evgkch/fsmjs/analysis";
import type { Graph } from "./graph.js";

/** The palette repeats after this many states. */
export const LANES = 8;

export function lanes(graph: Graph, start: string): string[] {
  const facts = analyze(graph, start);
  return [...facts.reachable, ...facts.unreachable];
}

/** The custom property that carries a state's colour, for the `style` attribute. */
export const hue = (i: number): string => `--c: var(--lane-${i % LANES})`;

/**
 * A state's colour, ready to put on a word — or nothing at all for a name this graph does not
 * have. Nothing is not a colour to fall back on: lane 0 belongs to the start state, and a word
 * wearing it because it was half-typed reads as an answer the figure has not given.
 */
export type Lane = (state: string) => string | undefined;

export function palette(graph: Graph, start: string): Lane {
  const lane = new Map(lanes(graph, start).map((n, i) => [n, i]));
  return (state) => {
    const i = lane.get(state);
    return i === undefined ? undefined : hue(i);
  };
}
