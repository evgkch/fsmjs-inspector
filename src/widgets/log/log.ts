/**
 * What happened, in order, with the time it happened at.
 *
 * The figure is the relation, the history is the run as a shape, and this is the run as a
 * sentence — the fourth projection, and the only one that keeps the thing the other three throw
 * away on purpose: *when*. A shape says a step came after another step. A log says it came four
 * minutes later, and four minutes is the difference between a machine that is working and a
 * machine that is stuck.
 *
 * It is `debug/log` given a face. The library already writes a line per transition, and the words
 * on that line are the words this writes: the state it left, the event, the state it reached, the
 * letter it emitted. What is not taken from the library is the *string* — a formatted line is one
 * colour, and a state name is written in its lane's colour everywhere else in this tool. So the
 * parts are drawn as parts, in the same order the library prints them.
 *
 * Repeats fold exactly as they fold in the history, out of the same function, because they are one
 * fact and it would be strange for two panels of one tool to disagree about how many times
 * something happened.
 */
import type { Edge } from "@evgkch/fsmjs";
import { halvesOf } from "../../entities/cell/index.js";
import { folds, hue, lanes } from "../../entities/machine/index.js";
import type { Graph, Step, Subject } from "../../entities/machine/index.js";
import { exploring } from "../../features/explore/index.js";
import type { Mode } from "../../features/explore/index.js";
import type { Focus } from "../../features/focus/index.js";
import { make, word } from "../../shared/lib/dom.js";
import "./ui/log.css";

export type Log = {
  readonly node: HTMLElement;
  readonly show: (graph: Graph, start: string) => void;
  readonly draw: () => void;
};

export type Wiring = {
  subject: Subject;
  focus: Focus;
  mode: Mode;
};

/**
 * The clock, to the millisecond.
 *
 * Not a date: a debugger is read inside one sitting, and the day it is being read on is the day it
 * is being read on. The milliseconds are the point — two transitions in the same millisecond are a
 * loop, and two a second apart are somebody typing.
 */
const clock = (t: number) => {
  const d = new Date(t);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
};

export function newLog(w: Wiring): Log {
  const rows = make("div", "lines");
  const node = make("aside", "log");
  node.append(make("div", "tag", "log"), rows);

  let row = new Map<string, number>();
  const colour = (state: string) => hue(row.get(state) ?? 0);

  const asEdge = (t: Step): Edge => ({
    from: t.source.type,
    on: t.input.type,
    to: t.target.type,
    emit: t.output?.type,
  });

  function build(): void {
    rows.replaceChildren();
    // Exploring there is no run, so there is nothing that happened and nothing that happened at a
    // time. The panel goes, rather than standing there empty above a figure of a schema.
    node.hidden = exploring(w.mode);
    if (node.hidden) return;

    const steps = w.subject.steps.map(asEdge);
    const times = w.subject.times;
    const at = w.subject.step;

    for (const f of folds(steps)) {
      const line = make("div", `line${f.first > at ? " ahead" : ""}`);
      // The time of the first of them. A fold is one thing that happened, and when it happened is
      // when it started — the last of sixty `move`s is when the drag ended, which is the next
      // line's business.
      line.append(
        word(clock(times[f.first - 1] ?? 0), "when"),
        word(f.edge.from, "q", colour(f.edge.from)),
        word("ON", "key"),
        word(f.edge.on, "ev"),
        word("TO", "key"),
        word(f.edge.to, "q", colour(f.edge.to)),
      );
      if (f.edge.emit !== undefined)
        line.append(word("EMIT", "key"), word(f.edge.emit, "out"));
      // How many times, in the same words the run says it in, and nothing at all when once.
      if (f.count > 1) line.append(word(`×${f.count}`, "again"));

      // Lit like anything else that names a rule, and not on offer: it has been taken already.
      // Pointing at a line here lights the cell on the figure and the rule in the source, which is
      // the whole reason a fourth projection is worth having beside the other three.
      const held = halvesOf(f.edge);
      line.addEventListener("mouseenter", () =>
        w.focus.pointer.dispatch("enter", {
          keys: held,
          offer: false,
          alive: true,
        }),
      );
      line.addEventListener("mouseleave", () => w.focus.pointer.dispatch("leave"));
      rows.append(line);
    }
    // Read at its end, like the run it is: what happened last is what you came for.
    rows.scrollTop = rows.scrollHeight;
  }

  return {
    node,
    show: (graph, start) => {
      row = new Map(lanes(graph, start).map((n, i) => [n, i]));
    },
    draw: build,
  };
}
