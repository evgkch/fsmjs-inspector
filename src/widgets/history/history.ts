/**
 * The transitions that were taken, in the order they were taken, and a way back to any of them.
 *
 * This panel used to have a reading above it — the rule under the pointer, written out. It does
 * not need one: pointing at a cell lights the line that rule is written on, in the text, in the
 * language, where you can also edit it. Saying it again here was one sentence rendered twice, and
 * the copy that was not being read was this one.
 *
 * What is left is what the text cannot show, because it is not in the text: what actually
 * happened. The words are still the library's own — the same sentence `toRules` prints and the
 * same one the editor is written in — so a step and the rule it took read alike. Rewinding does
 * not unwrite a step: a transition happened, and an undo is one more thing that happened; it only
 * moves where in them the machine stands.
 *
 * Exploring, nothing fires, so there is nothing here and the panel is not drawn at all.
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
import "./ui/history.css";

export type History = {
  readonly node: HTMLElement;
  /** The colours the sentences are written in — the figure's lanes, for the same states. */
  readonly palette: (graph: Graph, start: string) => void;
  /** The steps, and where in them the machine stands. */
  readonly draw: (exploring: boolean) => void;
};

export function newHistory(
  subject: Subject,
  rewind: (step: number) => void,
): History {
  const logEl = make("div", "log");
  const tag = make("h2", "tag");
  tag.append(make("span", "no", "#"), make("span", "", "history"));
  const undoBtn = make("button", "", "↶ undo");
  const redoBtn = make("button", "", "↷ redo");
  const startBtn = make("button", "", "↺ start");
  const rewindEl = make("div", "rewind");
  rewindEl.append(undoBtn, redoBtn, startBtn);
  const node = make("aside", "history");
  node.append(tag, logEl, rewindEl);

  undoBtn.addEventListener("click", () => rewind(subject.step - 1));
  redoBtn.addEventListener("click", () => rewind(subject.step + 1));
  startBtn.addEventListener("click", () => rewind(0));

  // Until a graph is set, a state is written in the ink of the panel. `palette` is what gives a
  // word the colour its column has in the figure.
  let colour: Lane = () => undefined;

  /** One rule, written out: `FROM q ON σ → TO r EMIT λ`. */
  const sentence = (r: Edge): HTMLElement => {
    const side = (out: boolean): HTMLElement => {
      const column = make("div", "side");
      const row = make("div", "one");
      const q = out ? r.to : r.from;
      row.append(word(out ? "TO" : "FROM", "key"), word(q, "q", colour(q)));
      if (out) {
        if (r.emit !== undefined)
          row.append(word("EMIT", "key"), word(r.emit, "l"));
      } else row.append(word("ON", "key"), word(r.on, "s"));
      column.append(row);
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

    draw: (exploring) => {
      undoBtn.disabled = !subject.rewind || subject.step === 0;
      redoBtn.disabled =
        !subject.rewind || subject.step >= subject.steps.length;
      startBtn.disabled = !subject.rewind || subject.step === 0;

      logEl.replaceChildren();
      node.hidden = exploring || subject.steps.length === 0;
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
        row.append(word(String(i + 1), "no"), sentence(asEdge(t)));
        row.addEventListener("click", () => rewind(i + 1));
        logEl.append(row);
      });
      logEl.scrollTop = logEl.scrollHeight;
    },
  };
}
