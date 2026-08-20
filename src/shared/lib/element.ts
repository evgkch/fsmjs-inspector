/**
 * The widgets' base, on Lit. It keeps the house contract: `wiring` is a property and rewiring
 * re-subscribes to the new subject; `draw(start)` remembers the start and renders; `dress()`
 * renders again — Lit diffs the template, so a dress costs what a class toggle cost. The shadow
 * carries two layers, the shared base under the widget's own sheet, as `shadow.ts` did.
 */
import { LitElement, unsafeCSS } from "lit";
import type { CSSResult } from "lit";
import type { Off } from "@evgkch/fsmjs";
import type { Change, Subject } from "../../entities/machine/index.js";
import base from "../ui/shadow.css?raw";

/** The two layers of every widget's shadow: the widget's sheet wins, `!important` wins back. */
export function sheets(own: string): CSSResult[] {
  return [
    unsafeCSS(`@layer base, widget;\n@layer base {\n${base}\n}`),
    unsafeCSS(`@layer widget {\n${own}\n}`),
  ];
}

export abstract class FsmjsElement<
  W extends { subject: Subject },
> extends LitElement {
  #w?: W;

  /** Where the rows are counted from — set by `draw`, fixed between draws. */
  protected start = "";

  #off: Off | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.#off || !this.#w) return;
    this.#off = this.#w.subject.watch((what) => this.moved(what));
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#off?.();
    this.#off = null;
  }

  set wiring(w: W) {
    // Rewired: stop hearing the old subject; already in the page, hear the new one now.
    this.#off?.();
    this.#off = null;
    this.#w = w;
    if (this.isConnected)
      this.#off = w.subject.watch((what) => this.moved(what));
    this.requestUpdate();
  }

  get wiring(): W {
    return this.#w!;
  }

  /** The wiring, for a subclass's render — undefined before the page hands one in. */
  protected get w(): W | undefined {
    return this.#w;
  }

  /** The machine moved. The default re-renders; a widget with a step animation overrides. */
  protected moved(_what: Change): void {
    this.requestUpdate();
  }

  draw(start: string): void {
    this.start = start;
    this.requestUpdate();
  }

  dress(): void {
    this.requestUpdate();
  }
}
