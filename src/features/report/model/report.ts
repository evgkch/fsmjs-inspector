/**
 * The developer's console: every move of the subject, written the way the language writes it.
 *
 * One collapsed group per step — `#k  from × on ⇀ to × emit`, the states in their lane colours —
 * with the payload and the reached context inside. A rewind and a restatement are one line each.
 * The pages and the overlay wire it; a page that wants silence never calls it.
 */
import type { Off } from "@evgkch/fsmjs";
import { lanes } from "../../../entities/machine/index.js";
import type { Subject } from "../../../entities/machine/index.js";

/** A state's colour, resolved to a value the console can paint with. */
type Ink = (state: string) => string;

const LANES = 8;

function inkOf(subject: Subject): Ink {
  const lane = new Map(
    lanes(subject.graph, subject.at).map((q, i) => [q, i % LANES]),
  );
  const face = getComputedStyle(document.documentElement);
  const paint = (i: number) => face.getPropertyValue(`--lane-${i}`).trim();
  return (q) => {
    const i = lane.get(q);
    return i === undefined ? "" : paint(i);
  };
}

const TAG =
  "background: color-mix(in oklab, currentColor 12%, transparent); border-radius: 4px; padding: 1px 5px; font-weight: 600";
const DIM = "color: color-mix(in oklab, currentColor 45%, transparent)";
const NAME = (colour: string) =>
  `font-weight: 700${colour ? `; color: ${colour}` : ""}`;

/**
 * Report the subject's moves until stopped. One reporter per subject: the pages start one when a
 * machine goes up and stop it with the subject.
 */
export function report(subject: Subject, name = "fsm"): Off {
  const ink = inkOf(subject);
  const states = Object.keys(subject.graph).length;
  console.info(
    `%c${name}%c watching — at %c${subject.at || "·"}%c, ${states} states`,
    TAG,
    "",
    NAME(ink(subject.at)),
    "",
  );
  return subject.watch((what) => {
    if (what.say === "step") {
      const k = subject.steps.length;
      const s = subject.steps[k - 1]!;
      console.groupCollapsed(
        `%c${name}%c #${k} %c${String(s.source.type)}%c × ${String(s.input.type)} %c⇀%c %c${String(s.target.type)}%c${s.output ? ` × ${String(s.output.type)}` : ""}`,
        TAG,
        DIM,
        NAME(ink(String(s.source.type))),
        "",
        DIM,
        "",
        NAME(ink(String(s.target.type))),
        "",
      );
      if (s.input.payload !== undefined)
        console.log("payload", s.input.payload);
      if (s.target.context !== undefined)
        console.log("context", s.target.context);
      if (s.output?.payload !== undefined)
        console.log("emitted", s.output.payload);
      console.groupEnd();
    } else if (what.say === "rewind") {
      console.info(
        `%c${name}%c ⟲ #${what.step} — at %c${subject.at || "·"}`,
        TAG,
        DIM,
        NAME(ink(subject.at)),
      );
    } else {
      console.info(
        `%c${name}%c ⟳ the run restated — ${subject.steps.length} steps, at %c${subject.at || "·"}`,
        TAG,
        DIM,
        NAME(ink(subject.at)),
      );
    }
  });
}
