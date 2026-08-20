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

/** One switch: the widget it shows, and the box that says so. */
type Seat = { member: Member & HTMLElement; box: HTMLInputElement };

export class FsmjsDesk extends HTMLElement {
  #root: ShadowRoot;
  #row: HTMLDivElement;

  #band: Ensemble | null = null;
  #panels: Panels | null = null;
  #seats = new Map<string, Seat>();
  #off: (() => boolean) | null = null;

  constructor() {
    super();
    this.className = "desk";
    this.#root = shadow(this, deskCss);
    this.#row = make("div", "switches");
    this.#root.append(this.#row);
  }

  set wiring(w: Wiring) {
    // Rewired: the old ensemble and menu belonged to the old subject.
    this.#band?.destroy();
    this.#off?.();
    this.#seats.clear();
    this.#row.replaceChildren();
    this.#band = ensemble(w.subject, {}, { focus: w.focus });
    this.#panels = newPanels([]);
    this.#off = this.#panels.rx.on(TRANSITION, () => this.#apply());
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
   * Wire the widget, draw it, and give it a switch. The name defaults to the tag without the
   * `fsmjs-` prefix; several widgets of one tag — three legends — are named by the caller.
   */
  enroll(member: Member & HTMLElement, name?: string): void {
    const band = this.#band;
    if (!band) return;
    const word = name ?? member.tagName.toLowerCase().replace(/^fsmjs-/, "");
    band.enroll(member);
    const label = make("label", "");
    const box = make("input", "");
    box.type = "checkbox";
    box.checked = !member.hidden;
    box.addEventListener("change", () =>
      this.#panels?.dispatch("put", { panel: word, up: box.checked }),
    );
    label.append(box, make("span", "", word));
    this.#row.append(label);
    this.#seats.set(word, { member, box });
  }

  /** What the panels machine says, worn: absent from the context is up. */
  #apply(): void {
    const up = this.#panels?.state.context ?? {};
    for (const [word, seat] of this.#seats) {
      const on = up[word] !== false;
      seat.member.hidden = !on;
      seat.box.checked = on;
    }
  }
}

if (!customElements.get("fsmjs-desk"))
  customElements.define("fsmjs-desk", FsmjsDesk);
