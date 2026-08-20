/**
 * The standalone page: a schema you can write, and an inspector pointed at it.
 *
 * Editor and figure share one `Focus`: both dispatch into the same pointer machine, so pointing
 * anywhere lights the rule everywhere, and either surface can name a rule to fire. The rest of
 * this file is where the schema comes from and which state a run starts at.
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
import { newFocus } from "../../features/focus/index.js";
import { page, read, shown } from "../../features/read-schema/index.js";
import { offOf } from "../../features/show-panels/index.js";
import type { Panel } from "../../features/show-panels/index.js";
import { canFire } from "../../features/take-rule/index.js";
import { el } from "../../shared/lib/dom.js";
import { looksLikeRules } from "../../shared/lang/rules.js";
import type { Written } from "../../shared/lang/rules.js";
import { FsmjsDiagram } from "../../widgets/diagram/diagram.js";
import { FsmjsDesk } from "../../widgets/desk/desk.js";
import { FsmjsLegend } from "../../widgets/legend/legend.js";
import { FsmjsEditor } from "../../widgets/editor/editor.js";
import { report } from "../../features/report/index.js";
import { mount } from "../../widgets/inspector/mount.js";
import type { Handle } from "../../widgets/inspector/mount.js";
import { SAMPLES } from "./model/samples.js";
import "./ui/workbench.css";

export function workbench(): void {
  const pane = el("text");
  const sampleSel = el<HTMLSelectElement>("sample");
  const startSel = el<HTMLSelectElement>("start");
  const back = el<HTMLButtonElement>("reset");
  const fresh = el<HTMLButtonElement>("new");
  const opener = el<HTMLButtonElement>("open");
  const dumper = el<HTMLButtonElement>("dump");
  const chooser = el<HTMLInputElement>("file");
  const host = el("inspector");
  const chart = el("chart");
  const strip = el("alphabet");
  const main = document.querySelector("main") as HTMLElement;

  const focus = newFocus();
  let subject: Text | null = null;
  let handle: Handle | null = null;

  // Which panels are up; the stylesheet hides what is down. All four switch here.
  // The desk is the menu; the page reads which panels are up off its machine.
  const desk = new FsmjsDesk();
  const panels = desk.panels;
  const board = el("panels");
  for (const panel of [
    "states",
    "in",
    "out",
    "code",
    "diagram",
    "figure",
    "history",
  ] as Panel[])
    desk.seat(panel);
  board.append(desk);
  const cover = () => void (main.dataset["off"] = offOf(panels));
  panels.rx.on(TRANSITION, cover);
  cover();
  /** What colour a state is drawn in, which is the figure's lane order and nothing else. */
  let lane: Lane = () => undefined;

  /** A rule of the text, as the guards name it: its cell, and its place in that cell. */
  const idOfLine = (r: Written) => ruleId(r.edge.from, r.edge.on, r.slot);

  let timer = 0;
  const editor = new FsmjsEditor();
  editor.wiring = {
    focus,
    onEdit: () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => read(editor.text(), startSel.value), 300);
    },
    fires: (r) => subject !== null && canFire(subject, idOfLine(r)),
    here: () => subject?.at ?? "",
    // Through the handle: the ensemble takes the rule and lets the selection go.
    fire: (r) => handle?.fire(idOfLine(r)),
  };
  pane.prepend(editor);

  // The page's two outputs: a machine is up, or the text stopped parsing.
  page.rx.on("built", ({ graph, start, rules }) => {
    subject?.stop();
    handle?.destroy();
    subject = fromText(graph, start);
    // The developer's console hears every move; stopping the subject stops it too.
    report(subject);
    handle = mount(host, subject, { focus });
    // Neither the diagram nor the legends are the mount's own pair; enrolled, they are wired
    // and redrawn with it.
    const dia = new FsmjsDiagram();
    chart.replaceChildren(dia);
    handle.enroll(dia);
    const board = handle;
    strip.replaceChildren(
      ...(["states", "in", "out"] as const).map((kind) => {
        const one = new FsmjsLegend();
        one.setAttribute("kind", kind);
        board.enroll(one);
        return one;
      }),
    );
    subject.watch(() => {
      editor.mark();
      // Nothing to forget until a step is taken.
      back.disabled = subject!.steps.length === 0;
    });
    back.disabled = subject.steps.length === 0;
    // One palette for text, figure and header alike.
    lane = palette(graph, start);
    fillStart(graph, start);
    warn(null, null);
    editor.show(rules, lane, flaws(graph, start));
  });

  page.rx.on("stopped", ({ message, line }) => warn(message, line));

  /** The reader's complaint, where the reading happens: in the editor, on the line it is about. */
  const warn = (message: string | null, line: number | null) =>
    editor.blame(message, line);

  /** The start selector: the same states, order and colours as the figure's index. */
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

  /** The name of a schema that is not one of the samples — opened or written here. */
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
    // The files are dumps; what is shown is the language.
    put(toRules(JSON.parse(SAMPLES[i]!.json) as object), "");
    sampleSel.value = String(i);
  }

  list();
  sampleSel.addEventListener("change", () => {
    // Choosing the one already on screen is not a choice.
    if (sampleSel.value !== "own") load(Number(sampleSel.value));
  });

  // `new` opens one rule, not an empty box: a schema with no states draws nothing.
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
      // A dump or the language; shown as the language either way. A file that is neither goes in
      // as it came, and the parser reports the line it stopped at.
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

  /** Write the schema on screen out as a dump — the form `JSON.stringify(machine)` produces. */
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

  // One act, two controls: choosing another start, and running from the same one again. Unlike
  // walking back to slice 0, this rebuilds the machine and drops the run.
  const begin = () => page.dispatch("begin", { start: startSel.value });
  startSel.addEventListener("change", begin);
  back.addEventListener("click", begin);

  load(0);
}
