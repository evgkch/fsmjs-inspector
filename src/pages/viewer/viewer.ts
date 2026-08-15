/**
 * The viewer: machines that are running somewhere else, drawn here.
 *
 * The standalone page reads a schema and lets you drive it; this one watches. What is different is
 * not the drawing — it is the same figure and the same run, mounted the same way — but what the
 * subject can do: a machine at the end of a pipe has no `drive` and no `rewind`, so nothing here
 * fires and nothing here is undone, and no part of the tool needed a flag to be told so.
 *
 * What the page has instead of a menu is a roster. One application publishes as many machines as
 * it has, they announce themselves, and the strip along the top is who is out there. There is
 * nothing else on it: no schema to choose, since the schemas are whatever is running; no source to
 * edit, since editing it here would edit nothing; no start to set, since the machine started
 * before this page was open.
 */
import { TRANSITION } from "@evgkch/fsmjs";
import { fromWire } from "../../entities/machine/index.js";
import type { Subject } from "../../entities/machine/index.js";
import { newSocket } from "../../shared/api/link.js";
import { el, make } from "../../shared/lib/dom.js";
import { mount } from "../inspector/mount.js";
import type { Handle } from "../inspector/mount.js";
import { newWatching, watched } from "./model/watching.js";
import "./ui/viewer.css";

/**
 * Where the relay is, unless the address says otherwise — `?ws=ws://host:port`.
 *
 * The same default the publisher dials, written in both places rather than shared: one of them
 * ships inside somebody else's application and the other is this page, and a constant they would
 * have to import from each other is a dependency between the two ends of a wire that is meant to
 * have none.
 */
const RELAY = "ws://localhost:8999";

export function viewer(): void {
  const url = new URLSearchParams(location.search).get("ws") ?? RELAY;
  const bar = el<HTMLDivElement>("bar");
  const strip = el<HTMLDivElement>("who");
  const note = el<HTMLParagraphElement>("note");
  const host = el<HTMLElement>("watch");
  const wait = el<HTMLElement>("wait");
  const said = el<HTMLParagraphElement>("said");
  const line = el<HTMLPreElement>("line");
  line.textContent = `import { inspect } from "@evgkch/fsmjs-inspector";\n\nconst fsm = inspect(yourMachine, { name: "cart" });`;

  const link = newSocket(url);
  const there = fromWire(link);
  const at = newWatching();

  /** What is on screen, and which subject it is of. Not a decision — a handle on a drawing. */
  let panel: { subject: Subject; handle: Handle } | null = null;
  /** The roster as it was last written out, so a hello from anybody does not rebuild all of it. */
  let written = "";

  const draw = () => {
    const list = there.list();
    const who = watched(at);
    const one = list.find((w) => w.who === who) ?? null;

    /*
     * Three things can be true, and they are not the same thing said louder.
     *
     * Nothing has connected: the inspector is listening and the wire is not up — either nothing is
     * running or it is dialling somewhere else, and the address is the only useful thing to say.
     * Connected and empty: the wire is fine, so what is missing is the line in the application,
     * and that line is what to show. Watching: the interface, and none of this.
     *
     * It was one sentence for the first two, which named the address at the moment the address was
     * the one thing that was demonstrably right.
     */
    wait.hidden = list.length > 0;
    bar.hidden = list.length === 0;
    if (!list.length) {
      const up = link.live();
      wait.classList.toggle("dialling", !up);
      said.textContent = up
        ? "Connected. No machine is being inspected yet — put this beside yours:"
        : `Waiting for a connection at ${url}`;
      line.hidden = !up;
    }

    // Rebuilt only when it is a different list. Every machine says hello whenever a pipe comes up,
    // and a strip rebuilt on each of those takes the keyboard focus off whatever was on it.
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

    // The panel is torn down only when it is about to be about something else: a step arriving is
    // a redraw inside the mount, not a new mount, and mounting again on every step would throw
    // away the figure and whatever the pointer was over sixty times a minute.
    if (panel && panel.subject !== one?.subject) {
      panel.handle.destroy();
      panel = null;
    }
    if (one && !panel)
      panel = { subject: one.subject, handle: mount(host, one.subject) };

    // What the machine is for, which its schema cannot say. Kept beside the roster rather than in
    // it: it belongs to the one being read, and four of them in a row would be a paragraph where
    // the names are.
    note.textContent = one?.note ?? "";
    note.hidden = !one?.note;
  };

  /**
   * The roster changed, so what this page is watching may no longer be there — and if it was
   * watching nothing, there may now be something.
   *
   * Both are said to the machine as what happened, and it decides: `gone` about a machine other
   * than the one on screen is no rule of it, which is how a worker restarting somewhere does not
   * take you off the checkout you are reading.
   */
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
