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
import type { Graph, Lane, Text } from "../../entities/machine/index.js";
import { exploring, newMode } from "../../features/explore/index.js";
import { newFocus } from "../../features/focus/index.js";
import { page, read, shown } from "../../features/read-schema/index.js";
import { canFire, take } from "../../features/take-rule/index.js";
import { el } from "../../shared/lib/dom.js";
import { looksLikeRules } from "../../shared/lang/rules.js";
import type { Written } from "../../shared/lang/rules.js";
import { newEditor } from "../../widgets/editor/editor.js";
import { mount } from "../inspector/mount.js";
import type { Handle } from "../inspector/mount.js";
import { SAMPLES } from "./model/samples.js";
import "./ui/workbench.css";

export function workbench(): void {
  const pane = el("text");
  const sampleSel = el<HTMLSelectElement>("sample");
  const startSel = el<HTMLSelectElement>("start");
  const flag = el<HTMLInputElement>("explore");
  const back = el<HTMLButtonElement>("reset");
  const fresh = el<HTMLButtonElement>("new");
  const opener = el<HTMLButtonElement>("open");
  const dumper = el<HTMLButtonElement>("dump");
  const chooser = el<HTMLInputElement>("file");
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
  /** What colour a state is drawn in, which is the figure's lane order and nothing else. */
  let lane: Lane = () => undefined;

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
    // Exploring, no state is current — in the text as in the figure.
    here: () => (exploring(mode) ? "" : (subject?.at ?? "")),
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
    // One palette, and everything that writes a state asks it: the text, the figure's own lanes
    // and the header, which names a state too. The same order of the same states everywhere.
    lane = palette(graph, start);
    fillStart(graph, start);
    warn(null, null);
    // And one reading of what is wrong with the schema, which the text and the figure both draw
    // on the names it is wrong about.
    editor.show(rules, lane, flaws(graph, start));
  });

  page.rx.on("stopped", ({ message, line }) => warn(message, line));

  /** The reader's complaint, where the reading happens: in the editor, on the line it is about. */
  const warn = (message: string | null, line: number | null) =>
    editor.blame(message, line);

  /**
   * Where a run begins, and every state it could begin at.
   *
   * Each name wears its own lane, and so does the field once one is chosen: a state is written in
   * its colour in the figure's index, in the run's index and in every line of the source, and the
   * header is the one place it was written in plain ink. The list is the same index as the
   * figure's, in the same order and the same colours — so choosing a start is choosing a row.
   */
  function fillStart(graph: Graph, start: string): void {
    startSel.replaceChildren(
      ...nodes(graph).map((n) => {
        const option = new Option(n, n, false, n === start);
        option.setAttribute("style", lane(n) ?? "");
        return option;
      }),
    );
    startSel.value = start;
    startSel.setAttribute("style", lane(start) ?? "");
  }

  /**
   * What is on screen, when it is not one of the samples. The list has to be able to say so: a
   * schema you opened or wrote yourself is still the subject, and a header that goes on naming the
   * sample you started from is a header telling you about a schema that is no longer there.
   */
  let own = "";

  function list(): void {
    sampleSel.replaceChildren(
      ...(own ? [new Option(own, "own", true, true)] : []),
      ...SAMPLES.map((s, i) => new Option(s.name, String(i))),
    );
  }

  /** A schema arriving from anywhere: written here, opened from a file, or one of the samples. */
  function put(text: string, name: string): void {
    own = name;
    list();
    editor.set(text);
    // No start to keep: a schema read fresh runs from the first state it names.
    read(editor.text(), "");
  }

  function load(i: number): void {
    // The files are dumps; what is shown is the language. `toRules` is the writer and `parseRules`
    // the reader, and the editor is the one place the two meet.
    put(toRules(JSON.parse(SAMPLES[i]!.json) as object), "");
    sampleSel.value = String(i);
  }

  list();
  sampleSel.addEventListener("change", () => {
    // Choosing the one already on screen is not a choice.
    if (sampleSel.value !== "own") load(Number(sampleSel.value));
  });

  /**
   * The smallest machine there is, and the sentence it is written in.
   *
   * Not an empty box: a schema with no states draws nothing, says nothing about the language, and
   * leaves the figure with an axis of none — so what `new` opens is one rule, which is a machine.
   */
  fresh.addEventListener("click", () =>
    put(
      "# one sentence per rule: FROM ON WHEN TO WITH EMIT BY\nFROM start ON go TO done\n",
      "new schema",
    ),
  );

  opener.addEventListener("click", () => chooser.click());
  chooser.addEventListener("change", () => {
    const file = chooser.files?.[0];
    // Cleared straight away, or opening the same file twice running is one event and then silence.
    chooser.value = "";
    if (!file) return;
    void file.text().then((text) => {
      const name = file.name.replace(/\.[^.]+$/, "");
      // A dump or the language — the same door either way. What is *shown* is always the language:
      // a dump is where a schema comes from, not how it is read. A file that is neither goes in as
      // it came, and the reader says which line it stopped at, which is a better complaint than
      // any this could make.
      try {
        put(
          looksLikeRules(text) ? text : toRules(JSON.parse(text) as object),
          name,
        );
      } catch {
        put(text, name);
      }
    });
  });

  /**
   * The schema on screen, as `JSON.stringify(machine)` writes it — which is what a dump is, and
   * what the library reads back. Whatever is drawn is what is written out, so a schema typed here
   * by hand leaves as a file the same way the samples arrived as one.
   */
  dumper.addEventListener("click", () => {
    const on = shown(page.state);
    if (!on) return;
    const slug =
      (own || SAMPLES[Number(sampleSel.value)]?.name || "schema")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "schema";
    const file = new Blob([`${JSON.stringify(on.graph, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  /**
   * Begin again, from whatever the start says.
   *
   * The two controls that do this are one act with one parameter: choosing another state to run
   * from, and running from the same one again. They were the same line written twice, which is the
   * usual sign that they are the same thing standing in two places.
   */
  const begin = () => page.dispatch("begin", { start: startSel.value });
  startSel.addEventListener("change", begin);

  /**
   * Forget the run: the same machine, built again from the same schema and the same start.
   *
   * Walking back to the first slice is not this — the steps stay on the board there, and a redo
   * takes them again, which is the whole point of a history you can move about in. This is the
   * other thing: it throws the machine away and makes another, which is what the page does
   * whenever the schema changes, and what choosing another start does with one word altered.
   */
  back.addEventListener("click", begin);

  flag.addEventListener("change", () =>
    mode.dispatch("read", { whole: flag.checked }),
  );

  mode.rx.on(TRANSITION, () => {
    // Exploring, no state is current and nothing has been taken: there is no run to forget.
    back.hidden = exploring(mode);
    editor.mark();
  });

  load(0);
}
