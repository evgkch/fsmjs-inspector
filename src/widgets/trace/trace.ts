/**
 * What the figure has come to, in words: the rule under the pointer, and every rule that was
 * taken.
 *
 * The words are the library's own — the same sentence `toRules` prints, the same one `rules`
 * writes for a transition, and the same one the editor is written in — so nothing on this page
 * has a vocabulary of its own. Which side of a reading has more than one line is what the figure
 * was asked: naming a cause leaves the left alone and lists what it can produce, naming an effect
 * leaves the right alone and lists what could have caused it, and pointing at a crossing can
 * leave both with several.
 */
import type { Edge } from "@evgkch/fsmjs";
import { palette } from "../../entities/machine/index.js";
import type {
  Graph,
  Lane,
  Step,
  Subject,
  Told,
} from "../../entities/machine/index.js";
import { make, word } from "../../shared/lib/dom.js";
import "./ui/trace.css";

export type Trace = {
  readonly node: HTMLElement;
  /** The colours the sentences are written in — the figure's lanes, for the same states. */
  readonly palette: (graph: Graph, start: string) => void;
  /** What is under the pointer, or held: overwritten every time, in both modes. */
  readonly reading: (rules: Edge[]) => void;
  /** The transitions that were taken, and where in them the machine stands. */
  readonly history: (exploring: boolean) => void;
};

export function newTrace(
  subject: Subject,
  rewind: (step: number) => void,
): Trace {
  const readingEl = make("div", "reading");
  const logEl = make("div", "log");
  const logTag = make("h2", "tag log-tag");
  logTag.append(make("span", "no", "#"), make("span", "", "history"));
  const undoBtn = make("button", "", "↶ undo");
  const redoBtn = make("button", "", "↷ redo");
  const startBtn = make("button", "", "↺ start");
  const rewindEl = make("div", "rewind");
  rewindEl.append(undoBtn, redoBtn, startBtn);
  const node = make("aside", "trace");
  node.append(make("h2", "tag", "reading"), readingEl, logTag, logEl, rewindEl);

  undoBtn.addEventListener("click", () => rewind(subject.step - 1));
  redoBtn.addEventListener("click", () => rewind(subject.step + 1));
  startBtn.addEventListener("click", () => rewind(0));

  // Until a graph is set, a state is written in the ink of the panel. `palette` is what gives a
  // word the colour its column has in the figure.
  let colour: Lane = () => undefined;

  /** A set of rules, written out: `FROM q ON σ → TO r EMIT λ`. */
  const sentence = (rules: Edge[]): HTMLElement => {
    const say = (r: Edge, out: boolean): HTMLElement => {
      const row = make("div", "one");
      const q = out ? r.to : r.from;
      row.append(word(out ? "TO" : "FROM", "key"), word(q, "q", colour(q)));
      if (out) {
        if (r.emit !== undefined)
          row.append(word("EMIT", "key"), word(r.emit, "l"));
      } else row.append(word("ON", "key"), word(r.on, "s"));
      return row;
    };

    const side = (out: boolean): HTMLElement => {
      const column = make("div", "side");
      const seen = new Set<string>();
      for (const r of rules) {
        const key = out ? `${r.to}\0${r.emit ?? ""}` : `${r.from}\0${r.on}`;
        if (seen.has(key)) continue;
        seen.add(key);
        column.append(say(r, out));
      }
      return column;
    };

    const box = make("div", "say");
    box.append(side(false), word("→", "arrow"), side(true));
    return box;
  };

  /** A transition that happened, read as the rule it took. */
  const asEdge = (t: Step): Edge => ({
    from: t.source.type,
    on: t.input.type,
    to: t.target.type,
    emit: t.output?.type,
  });

  return {
    node,

    palette: (graph, start) => {
      colour = palette(graph, start);
    },

    reading: (rules) =>
      readingEl.replaceChildren(
        rules.length ? sentence(rules) : word("point at a cell", "none"),
      ),

    /**
     * Exploring there are none, and there is nothing to keep: nothing fires, so the reading above
     * is the whole of what the figure has to say and the next pointer movement replaces it.
     * Running, every one of these happened, and rewinding does not unwrite what has been written —
     * it only moves where in them the machine stands.
     */
    history: (exploring) => {
      undoBtn.disabled = !subject.rewind || subject.step === 0;
      redoBtn.disabled =
        !subject.rewind || subject.step >= subject.steps.length;
      startBtn.disabled = !subject.rewind || subject.step === 0;

      logEl.replaceChildren();
      if (exploring) return;
      const at = subject.step;
      subject.steps.forEach((t, i) => {
        const row = make(
          "button",
          `step${i + 1 === at ? " now" : ""}${i + 1 > at ? " ahead" : ""}`,
        );
        row.title = (t as Partial<Told>).line ?? "";
        // Which step this is. The machine's position is one of these numbers, and `history.jump`
        // takes exactly it, so the column is the index the rewinding is done by.
        row.append(word(String(i + 1), "no"), sentence([asEdge(t)]));
        row.addEventListener("click", () => rewind(i + 1));
        logEl.append(row);
      });
      logEl.scrollTop = logEl.scrollHeight;
    },
  };
}
