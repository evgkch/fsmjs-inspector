/**
 * The desk: one widget that runs the others. It holds an ensemble — a widget enrolled here is
 * wired to the shared subject and focus and redrawn with everyone — and draws the menu: one
 * switch per enrolled widget, in the header's segmented box. The widgets stay where the page put
 * them; a switch turns its widget's `hidden` on and off.
 *
 * Custom element `<fsmjs-desk>`: `wiring = { subject, focus? }`, then `enroll(widget, name?)`.
 */
import type { Subject } from "../../entities/machine/index.js";
import type { Focus } from "../../features/focus/index.js";
import { newPanels } from "../../features/show-panels/index.js";
import type { Panels } from "../../features/show-panels/index.js";
import { ensemble } from "../../pages/inspector/ensemble.js";
import type { Ensemble, Member } from "../../pages/inspector/ensemble.js";
import { TRANSITION } from "@evgkch/fsmjs";
import { make } from "../../shared/lib/dom.js";
import { shadow } from "../../shared/lib/shadow.js";
import deskCss from "./ui/desk.css?raw";

export type Wiring = {
  subject: Subject;
  /** Shared with anything else on the page; without one the desk makes its own. */
  focus?: Focus;
};

/** One switch: the box, and — when the desk itself shows and hides it — the widget. */
type Seat = { box: HTMLInputElement; member?: Member & HTMLElement };

export class FsmjsDesk extends HTMLElement {
  #root: ShadowRoot;
  #row: HTMLDivElement;

  #band: Ensemble | null = null;
  #panels: Panels | null = null;
  #seats = new Map<string, Seat>();

  constructor() {
    super();
    this.className = "desk";
    this.#root = shadow(this, deskCss);
    this.#row = make("div", "switches");
    this.#root.append(this.#row);
    // The menu stands without a subject: a page that runs its own layout only takes seats.
    this.#panels = newPanels([]);
    // The machine and the element live and die together; nothing to unsubscribe.
    this.#panels.rx.on(TRANSITION, () => this.#apply());
  }

  set wiring(w: Wiring) {
    // Rewired: the old ensemble belonged to the old subject.
    this.#band?.destroy();
    this.#band = ensemble(w.subject, {}, { focus: w.focus });
  }

  /** The binder behind the menu: `fire`, `rewind`, `forget`, `draw` for the page's own use. */
  get ensemble(): Ensemble {
    return this.#band!;
  }

  /** Which widgets are up — for a page that lays panels out itself. */
  get panels(): Panels {
    return this.#panels!;
  }

  /**
   * A switch alone, for a panel the page shows and hides itself — its state is read off
   * `panels`. A locked seat is shown as it stands and takes no click.
   */
  seat(name: string, opts: { locked?: boolean; title?: string } = {}): void {
    const label = make("label", "");
    if (opts.title !== undefined) label.title = opts.title;
    const box = make("input", "");
    box.type = "checkbox";
    box.checked = true;
    if (opts.locked) box.disabled = true;
    else
      box.addEventListener("change", () =>
        this.#panels?.dispatch("put", { panel: name, up: box.checked }),
      );
    label.append(box, make("span", "", name));
    this.#row.append(label);
    this.#seats.set(name, { box });
  }

  /**
   * Wire the widget, draw it, and give it a switch that shows and hides it. The name defaults
   * to the tag without the `fsmjs-` prefix; several widgets of one tag — three legends — are
   * named by the caller.
   */
  enroll(member: Member & HTMLElement, name?: string): void {
    const band = this.#band;
    if (!band) return;
    const word = name ?? member.tagName.toLowerCase().replace(/^fsmjs-/, "");
    band.enroll(member);
    this.seat(word);
    this.#seats.get(word)!.member = member;
  }

  /** What the panels machine says, worn: absent from the context is up. */
  #apply(): void {
    const up = this.#panels?.state.context ?? {};
    for (const [word, seat] of this.#seats) {
      const on = up[word] !== false;
      seat.box.checked = on;
      if (seat.member) seat.member.hidden = !on;
    }
  }
}

if (!customElements.get("fsmjs-desk"))
  customElements.define("fsmjs-desk", FsmjsDesk);
