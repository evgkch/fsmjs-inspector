/**
 * `overlay(fsm)` — the tool mounted on the page being debugged, over a machine running in the
 * same scope. Unlike `inspect(fsm)`, which publishes to an inspector elsewhere and draws
 * nothing, this draws here. Pressing a cause and an effect sends the event to the machine; its
 * own guards decide which rule fires.
 */
import { TRANSITION } from "@evgkch/fsmjs";
import type { AnyMachine } from "@evgkch/fsmjs";
import { newDrag } from "../features/drag-panel/index.js";
import { fromMachine } from "../entities/machine/index.js";
import type { WatchOptions } from "../entities/machine/index.js";
import { report } from "../features/report/index.js";
import { mount } from "../pages/inspector/mount.js";
import type { Options as LookOptions } from "../pages/inspector/mount.js";
import "./ui/overlay.css";

export type Options = LookOptions &
  WatchOptions & {
    /** Where to put it. Left out, it floats over the page and can be dragged by its bar. */
    into?: HTMLElement;
    /** Shown in the panel's bar, so two of these can be told apart. */
    title?: string;
  };

export type Overlaid = { close: () => void };

/** Look at a machine that is running. Returns the way to stop looking. */
export function overlay(fsm: AnyMachine, options: Options = {}): Overlaid {
  const subject = fromMachine(fsm, { history: options.history });

  if (options.into) {
    const handle = mount(options.into, subject, options);
    return {
      close: () => {
        handle.destroy();
        subject.stop();
      },
    };
  }

  // A floating panel with its own stylesheet; the application underneath needs nothing.
  const panel = document.createElement("div");
  panel.className = "fsmjs-overlay";

  const bar = document.createElement("div");
  bar.className = "overlay-bar";
  const name = document.createElement("span");
  name.textContent = options.title ?? "inspector";
  const shut = document.createElement("button");
  shut.textContent = "✕";
  shut.title = "close";
  bar.append(name, shut);

  const body = document.createElement("div");
  body.className = "overlay-body";
  panel.append(bar, body);
  document.body.append(panel);

  const handle = mount(body, subject, options);
  report(subject, options.title ?? "inspector");

  // Dragged by its bar.
  const drag = newDrag();
  const move = (e: PointerEvent) =>
    drag.dispatch("pointermove", { x: e.clientX, y: e.clientY });
  const up = () => drag.dispatch("pointerup");

  bar.addEventListener("pointerdown", (down) => {
    const at = panel.getBoundingClientRect();
    // `grab` is false over the close button.
    drag.dispatch("pointerdown", {
      x: down.clientX,
      y: down.clientY,
      left: at.left,
      top: at.top,
      grab: down.target !== shut,
    });
  });

  drag.rx.on("put", ({ left, top }) => {
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  });

  // Window listeners follow the drag machine's state; add/remove of an existing/absent listener
  // is a no-op, so no extra bookkeeping.
  const watching = () => {
    const on = drag.state.type === "dragging";
    for (const [kind, hand] of [
      ["pointermove", move],
      ["pointerup", up],
    ] as const)
      if (on) addEventListener(kind, hand);
      else removeEventListener(kind, hand);
  };
  const loose = drag.rx.on(TRANSITION, watching);

  const close = () => {
    loose();
    removeEventListener("pointermove", move);
    removeEventListener("pointerup", up);
    handle.destroy();
    subject.stop();
    panel.remove();
  };
  shut.addEventListener("click", close);

  return { close };
}
