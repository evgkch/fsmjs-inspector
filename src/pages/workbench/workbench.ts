/**
 * The standalone page: a schema you can write, and an inspector pointed at it.
 *
 * The two panes are one thing seen twice — the text is the machine, and the figure is the machine
 * — so they are given one `Focus` between them. That is the whole of the wiring: the editor's
 * gutter and the figure's cells dispatch into the same pointer machine, so pointing anywhere
 * lights the rule everywhere it is written, and either surface can name a rule to fire.
 *
 * What is left here is the other half of a page — where the schema comes from, and which state a
 * run starts at. What `analyze` and `validate` make of it is not shown here at all: it is drawn on
 * the names and the lines it is about, in the text and in the figure.
 */
import { TRANSITION, nodes } from "@evgkch/fsmjs";
import { toRules } from "@evgkch/fsmjs/formatters";
import {
  flaws,
  fromText,
  palette,
  ruleId,
} from "../../entities/machine/index.js";
import type { Graph, Text } from "../../entities/machine/index.js";
import { exploring, newMode } from "../../features/explore/index.js";
import { newFocus } from "../../features/focus/index.js";
import { page, read } from "../../features/read-schema/index.js";
import { canFire, take } from "../../features/take-rule/index.js";
import { el } from "../../shared/lib/dom.js";
import type { Written } from "../../shared/lang/rules.js";
import { newEditor } from "../../widgets/editor/editor.js";
import { mount } from "../inspector/mount.js";
import type { Handle } from "../inspector/mount.js";
import { SAMPLES } from "./model/samples.js";
import type { Sample } from "./model/samples.js";
import "./ui/workbench.css";

export function workbench(): void {
  const pane = el("text");
  const sampleSel = el<HTMLSelectElement>("sample");
  const startSel = el<HTMLSelectElement>("start");
  const flag = el<HTMLInputElement>("explore");
  const back = el<HTMLButtonElement>("reset");
  const host = el("inspector");

  const focus = newFocus();
  /**
   * The mode, once for the page and not once per mount: the inspector is thrown away and built
   * again on every edit of the text, and how the page is being read is not something an edit
   * changes. Everything that differs between the two modes listens to this — the figure and the
   * run through the mount, the gutter's marks and the reset button from here.
   */
  const mode = newMode();
  let subject: Text | null = null;
  let handle: Handle | null = null;

  /** A rule of the text, as the guards name it: its cell, and its place in that cell. */
  const idOfLine = (r: Written) => ruleId(r.edge.from, r.edge.on, r.slot);

  let timer = 0;
  const editor = newEditor({
    focus,
    onEdit: () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => read(editor.text(), startSel.value), 300);
    },
    // Exploring, no state is current and nothing fires — in the text as in the figure.
    fires: (r) =>
      !exploring(mode) && subject !== null && canFire(subject, idOfLine(r)),
    fire: (r) => subject && take(subject, idOfLine(r)),
  });
  pane.prepend(editor.node);

  // The page's two outputs are the whole of its effect on the DOM: one says a machine is up, the
  // other says the text stopped parsing.
  page.rx.on("built", ({ graph, start, rules }) => {
    subject?.stop();
    handle?.destroy();
    subject = fromText(graph, start);
    handle = mount(host, subject, { focus, mode });
    // The run marker in the gutter is about where the machine stands, so it follows the machine.
    subject.watch(() => editor.mark());
    fillStart(graph, start);
    warn(null, null);
    // One palette, and everything that writes a state asks it: the text and the figure's own lanes
    // are the same order of the same states. And one reading of what is wrong with the schema,
    // which both of them draw on the names it is wrong about.
    editor.show(rules, palette(graph, start), flaws(graph, start));
  });

  page.rx.on("stopped", ({ message, line }) => warn(message, line));

  /** The reader's complaint, where the reading happens: in the editor, on the line it is about. */
  const warn = (message: string | null, line: number | null) =>
    editor.blame(message, line);

  function fillStart(graph: Graph, start: string): void {
    startSel.replaceChildren(
      ...nodes(graph).map((n) => new Option(n, n, false, n === start)),
    );
    startSel.value = start;
  }

  function load(s: Sample): void {
    // The files are dumps; what is shown is the language. `toRules` is the writer and `parseRules`
    // the reader, and the editor is the one place the two meet.
    editor.set(toRules(JSON.parse(s.json) as object));
    // No start to keep: a schema read fresh runs from the first state it names.
    read(editor.text(), "");
  }

  sampleSel.replaceChildren(
    ...SAMPLES.map((s, i) => new Option(s.name, String(i))),
  );
  sampleSel.addEventListener("change", () =>
    load(SAMPLES[Number(sampleSel.value)]!),
  );

  startSel.addEventListener("change", () =>
    page.dispatch("begin", { start: startSel.value }),
  );

  /**
   * Forget the run: the same machine, built again from the same schema and the same start.
   *
   * Walking back to the first slice is not this — the steps stay on the board there, and a redo
   * takes them again, which is the whole point of a history you can move about in. This is the
   * other thing, and it belongs to the page rather than to the figure: what it does is throw away
   * the machine and make another, which is what the page does whenever the schema changes.
   */
  back.addEventListener("click", () =>
    page.dispatch("begin", { start: startSel.value }),
  );

  // The switch is an input and not the fact. What it does is say what was asked for; what the
  // page does about it hangs off the mode, so a second way of asking — a keystroke, another
  // inspector on the same page — would not have to remember this list.
  flag.addEventListener("change", () =>
    mode.dispatch("read", { whole: flag.checked }),
  );

  mode.rx.on(TRANSITION, () => {
    // Exploring, no state is current and nothing has been taken: there is no run to forget.
    back.hidden = exploring(mode);
    editor.mark();
  });

  load(SAMPLES[0]!);
}
