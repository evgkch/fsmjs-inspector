/**
 * The viewer: machines running somewhere else, drawn here. The same figure and run as the
 * standalone page, but the subject has no `drive` and no `rewind` (unless a `History` was handed
 * over), so nothing fires and nothing is edited. Instead of a schema menu there is a roster:
 * every published machine announces itself, and the strip along the top lists them.
 */
import { TRANSITION } from "@evgkch/fsmjs";
import { toRules } from "@evgkch/fsmjs/formatters";
import { flaws, fromWire, palette } from "../../entities/machine/index.js";
import type { Subject } from "../../entities/machine/index.js";
import { newFocus } from "../../features/focus/index.js";
import { newPanels, offOf } from "../../features/show-panels/index.js";
import type { Panel } from "../../features/show-panels/index.js";
import { page, read } from "../../features/read-schema/index.js";
import { newSocket } from "../../shared/api/link.js";
import { el, make } from "../../shared/lib/dom.js";
import { FsmjsDiagram } from "../../widgets/diagram/diagram.js";
import { FsmjsLegend } from "../../widgets/legend/legend.js";
import { FsmjsEditor } from "../../widgets/editor/editor.js";
import { report } from "../../features/report/index.js";
import { mount } from "../inspector/mount.js";
import type { Handle } from "../inspector/mount.js";
import { newWatching, watched } from "./model/watching.js";
import "../../shared/ui/switches.css";
import "./ui/viewer.css";

/**
 * Where the relay is, unless the address says otherwise — `?ws=ws://host:port`. The same default
 * as the publisher's, written in both places: the two ends of the wire share no imports.
 */
const RELAY = "ws://localhost:8999";

export function viewer(): void {
  const url = new URLSearchParams(location.search).get("ws") ?? RELAY;
  const main = document.querySelector("main") as HTMLElement;
  const bar = el<HTMLDivElement>("bar");
  const strip = el<HTMLDivElement>("who");
  const what = el<HTMLElement>("what");
  const title = el<HTMLHeadingElement>("name");
  const note = el<HTMLParagraphElement>("note");
  const host = el<HTMLElement>("watch");
  const work = el<HTMLElement>("work");
  const alphabet = el<HTMLDivElement>("alphabet");
  const wait = el<HTMLElement>("wait");
  const said = el<HTMLParagraphElement>("said");
  const line = el<HTMLPreElement>("line");
  line.textContent = `import { inspect } from "@evgkch/fsmjs-inspector";\n\nconst fsm = inspect(yourMachine, { name: "cart" });`;

  const link = newSocket(url);
  const there = fromWire(link);
  const at = newWatching();

  // One `Focus` between source and figure, as on the standalone page: pointing at either lights
  // both.
  const focus = newFocus();
  const source = el<HTMLElement>("text");
  const editor = new FsmjsEditor();
  editor.wiring = {
    focus,
    // The machine is compiled into another application; typing could not reach it.
    readonly: true,
    onEdit: () => {},
    fires: () => false,
    here: () => panel?.subject.at ?? "",
    fire: () => {},
  };
  source.append(editor);

  // A graph off the wire is written out with `toRules` and read back by the same reader the
  // standalone page uses, so the source on screen is the language, with line positions.
  page.rx.on("built", ({ graph, start, rules }) =>
    editor.show(rules, palette(graph, start), flaws(graph, start)),
  );

  // Which panels are up; the stylesheet hides what is down, so no widget is reached into.
  const panels = newPanels([
    "states",
    "in",
    "out",
    "code",
    "diagram",
    "figure",
    "history",
  ]);
  const board = el<HTMLElement>("panels");
  for (const panel of [
    "states",
    "in",
    "out",
    "code",
    "diagram",
    "figure",
    "history",
  ] as Panel[]) {
    const label = make("label", "panel");
    const box = make("input", "");
    box.type = "checkbox";
    box.checked = true;
    // The source is always on; its box is shown and takes no clicks.
    if (panel === "code") {
      box.disabled = true;
      label.title = "the source is always on";
    } else
      box.addEventListener("change", () =>
        panels.dispatch("put", { panel, up: box.checked }),
      );
    label.append(box, make("span", "", panel));
    board.append(label);
  }
  const dress = () => void (main.dataset["off"] = offOf(panels));
  panels.rx.on(TRANSITION, dress);
  dress();

  const chart = el<HTMLElement>("chart");

  /** What is on screen, and which subject it is of. Not a decision — a handle on a drawing. */
  let panel: { subject: Subject; handle: Handle } | null = null;
  /** The roster as it was last written out, so a hello from anybody does not rebuild all of it. */
  let written = "";

  const draw = () => {
    const list = there.list();
    const who = watched(at);
    const one = list.find((w) => w.who === who) ?? null;

    // Three cases: not connected — say the address; connected and empty — show the line to add
    // to the application; watching — the interface.
    wait.hidden = list.length > 0;
    bar.hidden = list.length === 0;
    work.hidden = list.length === 0;
    alphabet.hidden = list.length === 0;
    what.hidden = one === null;
    // With one machine there is nothing to choose; the name below already says what it is.
    strip.hidden = list.length < 2;
    if (!list.length) {
      const up = link.live();
      wait.classList.toggle("dialling", !up);
      said.textContent = up
        ? "Connected. No machine is being inspected yet — put this beside yours:"
        : `Waiting for a connection at ${url}`;
      line.hidden = !up;
    }

    // Rebuilt only for a different list: hellos repeat on every reconnect, and a rebuild takes
    // the keyboard focus.
    const now = list.map((w) => `${w.who}\0${w.name}`).join("\n");
    if (now !== written) {
      written = now;
      strip.replaceChildren(
        ...list.map((w) => {
          const tab = make("button", "who", w.name);
          tab.addEventListener("click", () =>
            at.dispatch("pick", { who: w.who }),
          );
          return tab;
        }),
      );
    }
    for (const [i, tab] of [...strip.children].entries())
      tab.classList.toggle("now", list[i]?.who === who);

    // Torn down only for a different subject: a step is a redraw inside the mount, not a remount.
    if (panel && panel.subject !== one?.subject) {
      panel.handle.destroy();
      chart.replaceChildren();
      panel = null;
    }
    if (one && !panel) {
      const handle = mount(host, one.subject, { focus });
      report(one.subject, one.who);
      // The diagram is not one of the mount's own pair; enrolled, it is wired and redrawn with them.
      const dia = new FsmjsDiagram();
      chart.replaceChildren(dia);
      handle.enroll(dia);
      alphabet.replaceChildren(
        ...(["states", "in", "out"] as const).map((kind) => {
          const one = new FsmjsLegend();
          one.setAttribute("kind", kind);
          handle.enroll(one);
          return one;
        }),
      );
      panel = { subject: one.subject, handle };
      // Set, then read: the colours and gutter marks come out of the reader.
      const text = toRules(one.subject.graph as object);
      editor.set(text);
      read(text, one.subject.at);
      one.subject.watch(() => editor.mark());
    }

    // The watched machine's name and description, under the roster.
    title.textContent = one?.name ?? "";
    note.textContent = one?.note ?? "";
    note.hidden = !one?.note;
  };

  // The roster changed: the watched machine may be gone, or there may now be one to watch. The
  // watching machine decides — `gone` about another machine is no rule of it.
  const settle = () => {
    const list = there.list();
    const who = watched(at);
    if (who && !list.some((w) => w.who === who)) at.dispatch("gone", { who });
    if (!watched(at) && list[0]) at.dispatch("pick", { who: list[0].who });
    draw();
  };

  there.rx.on("roster", settle);
  at.rx.on(TRANSITION, draw);
  // The wire moving changes what there is to say while nothing is being watched, and nothing else.
  link.rx.on("open", draw);
  link.rx.on("down", draw);
  settle();
}
