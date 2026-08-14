/**
 * `inspect(fsm)` — the inspector over your own application, on a machine that is running.
 *
 * No install, no manifest, no bridge across a devtools boundary: the machine is right here, in
 * this tab, in this scope, so the shortest way to look at it is to put the tool on top of it. One
 * call from a console or from a line of code you delete afterwards.
 *
 * What you get is the same figure the page shows, and it is not a picture of the machine — it is
 * the machine. Where it stands is where it stands. What it has done is what it did. Press a cause
 * and an effect and the event goes to your machine; which rule of the cell takes it is decided by
 * your guards, which are real code, so the rule that fires may not be the one you pressed. That
 * is the thing you opened this to see.
 */
import { TRANSITION } from "@evgkch/fsmjs";
import type { StateMachine } from "@evgkch/fsmjs";
import { newDrag } from "../features/drag-panel/index.js";
import { fromMachine } from "../entities/machine/index.js";
import type { Ctx, Ev, WatchOptions } from "../entities/machine/index.js";
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

export type Inspection = { close: () => void };

/** Look at a machine that is running. Returns the way to stop looking. */
export function inspect(
  fsm: StateMachine<Ctx, Ev, Ev>,
  options: Options = {},
): Inspection {
  const subject = fromMachine(fsm, { rewind: options.rewind });

  if (options.into) {
    const handle = mount(options.into, subject, options);
    return {
      close: () => {
        handle.destroy();
        subject.stop();
      },
    };
  }

  // A panel of its own, over whatever is on the page. It carries the stylesheet with it, so the
  // application it is sitting on top of does not have to know the tool exists.
  const panel = document.createElement("div");
  panel.className = "fsmjs-overlay";

  const bar = document.createElement("div");
  bar.className = "overlay-bar";
  const name = document.createElement("span");
  name.textContent = options.title ?? "inspector";
  const flag = document.createElement("label");
  flag.className = "flag";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = options.exploring ?? false;
  flag.append(box, document.createTextNode("explore"));
  const shut = document.createElement("button");
  shut.textContent = "✕";
  shut.title = "close";
  bar.append(name, flag, shut);

  const body = document.createElement("div");
  body.className = "overlay-body";
  panel.append(bar, body);
  document.body.append(panel);

  const handle = mount(body, subject, options);
  box.addEventListener("change", () => handle.set({ exploring: box.checked }));

  // Dragged by its bar, because a panel over an application is always over the wrong part of it.
  const drag = newDrag();
  const move = (e: PointerEvent) =>
    drag.dispatch("pointermove", { x: e.clientX, y: e.clientY });
  const up = () => drag.dispatch("pointerup");

  bar.addEventListener("pointerdown", (down) => {
    const at = panel.getBoundingClientRect();
    // Facts, all of them: where the pointer went down, where the panel is, and whether what was
    // under it was the bar rather than one of the controls standing on it.
    drag.dispatch("pointerdown", {
      x: down.clientX,
      y: down.clientY,
      left: at.left,
      top: at.top,
      grab: down.target !== shut && !flag.contains(down.target as Node),
    });
  });

  drag.rx.on("put", ({ left, top }) => {
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  });

  // The listeners are a drawing of the state and not the state itself: the page watches the
  // pointer while the machine is dragging, and stops when it stops. Adding one that is already
  // there, or removing one that is not, is a no-op — so this needs no memory of its own.
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
