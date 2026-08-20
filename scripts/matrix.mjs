// The cross-widget matrix: every manual action on one widget, its reflection on the other
// three. Runs a real DOM (happy-dom) over the source via vite, presses and points, and counts
// what each widget rendered. `npm run matrix`; exits 1 on any mismatch.
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const { Window } = await import(`${root}/node_modules/happy-dom/lib/index.js`);
const win = new Window();
for (const k of [
  "window",
  "document",
  "customElements",
  "HTMLElement",
  "SVGElement",
  "ResizeObserver",
  "getComputedStyle",
  "CSSStyleSheet",
  "requestAnimationFrame",
  "MouseEvent",
]) {
  try {
    Object.defineProperty(globalThis, k, {
      value: win[k] ?? win.window[k],
      configurable: true,
    });
  } catch {}
}
const { createServer } = await import(
  `${root}/node_modules/vite/dist/node/index.js`
);
const { toRules } = await import(
  `${root}/node_modules/@evgkch/fsmjs/dist/formatters/index.js`
);
const server = await createServer({
  root,
  logLevel: "error",
  server: { middlewareMode: true },
});
const tick = () => new Promise((r) => setTimeout(r, 40));
let failed = 0;
const eq = (name, got, want) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}: ${got}${ok ? "" : ` (want ${want})`}`,
  );
};
try {
  const { fromText } = await server.ssrLoadModule(
    "/src/entities/machine/lib/from-text.ts",
  );
  const machine = await server.ssrLoadModule("/src/entities/machine/index.ts");
  const { mount } = await server.ssrLoadModule("/src/pages/inspector/mount.ts");
  const { FsmjsDiagram } = await server.ssrLoadModule(
    "/src/widgets/diagram/diagram.ts",
  );
  const { FsmjsEditor } = await server.ssrLoadModule(
    "/src/widgets/editor/editor.ts",
  );
  const { newFocus } = await server.ssrLoadModule(
    "/src/features/focus/model/focus.ts",
  );
  const { page, shown } = await server.ssrLoadModule(
    "/src/features/read-schema/model/page.ts",
  );
  const { read } = await server.ssrLoadModule(
    "/src/features/read-schema/model/read.ts",
  );
  const { canFire } = await server.ssrLoadModule(
    "/src/features/take-rule/model/take.ts",
  );

  const graph = {
    A: {
      go: [{ to: "B", emit: "x" }, { to: "B", emit: "y" }, { to: "C" }],
      loop: [{ to: "A" }],
    },
    B: { back: [{ to: "A" }] },
    C: { down: [{ to: "B" }], jump: [{ to: "D" }] },
    D: {},
  };
  const subject = fromText(graph, "A");
  const focus = newFocus();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const handle = mount(host, subject, { focus });
  const dia = new FsmjsDiagram();
  document.body.appendChild(dia);
  handle.enroll(dia);

  const editor = new FsmjsEditor();
  editor.wiring = {
    focus,
    onEdit: () => {},
    fires: (r) =>
      canFire(subject, machine.ruleId(r.edge.from, r.edge.on, r.slot)),
    here: () => subject.at ?? "",
    fire: (r) => handle.fire(machine.ruleId(r.edge.from, r.edge.on, r.slot)),
  };
  document.body.appendChild(editor);
  const text = toRules(graph);
  editor.set(text);
  read(text, "A");
  const built = shown(page.state);
  if (!built) throw new Error("read-schema did not build");
  editor.show(
    built.rules,
    machine.palette(graph, "A"),
    machine.flaws(graph, "A"),
  );
  await tick();

  const fig = host.querySelector("fsmjs-figure");
  const hist = host.querySelector("fsmjs-history");
  const q = (el, sel) => el.shadowRoot.querySelectorAll(sel).length;
  const chip = (name) =>
    [...dia.shadowRoot.querySelectorAll("g.chip")].find(
      (c) => c.textContent.trim() === name,
    );
  const arcs = () => [...dia.shadowRoot.querySelectorAll("g.arc")];
  const litArcs = () =>
    arcs().filter((a) => a.classList.contains("lit")).length;
  const farArcs = () =>
    arcs().filter((a) => a.classList.contains("far")).length;
  const dimChips = () => q(dia, "g.chip.dim");
  const farChips = () => q(dia, "g.chip.far");
  const heldChips = () => q(dia, "g.chip.held");
  const wash = () => q(fig, ".wash rect");
  const previews = () => q(hist, "path.maybe");
  const litLines = () => q(editor, ".ink .line.lit");
  const click = (el) =>
    el.dispatchEvent(new win.window.PointerEvent("click", { bubbles: true }));
  const enter = (el) =>
    el.dispatchEvent(new win.window.PointerEvent("pointerenter"));
  const leaveP = (el) =>
    el.dispatchEvent(new win.window.PointerEvent("pointerleave"));
  const forget = () => {
    focus.choice.dispatch("drop");
    focus.pointer.dispatch("leave");
  };

  console.log("— M1: diagram chip A pressed (running) —");
  click(chip("A"));
  await tick();
  eq("diagram held chips", heldChips(), 1);
  eq("figure wash bands", wash(), 1);
  eq("editor lit lines (A's 4 rules)", litLines(), 4);
  eq("history previews (targets B, C, A)", previews(), 3);
  eq("diagram lit arcs (A→B ×2, A→C, A→A)", litArcs(), 4);
  eq("diagram far arcs (B→A, C→B, C→D)", farArcs(), 3);
  eq("diagram dim chips (D unreachable this step)", dimChips(), 1);

  console.log("— M2: chip B hovered while A held → the corner —");
  enter(chip("B"));
  await tick();
  eq("history previews (one, to B)", previews(), 1);
  eq("diagram lit arcs (the two A→B lines)", litArcs(), 2);
  eq("editor lit lines (A→B rules)", litLines(), 2);
  eq("figure bands: row, target column, event, two outputs", wash(), 5);

  console.log("— M3: pointer leaves → the hold still shows —");
  leaveP(chip("B"));
  await tick();
  eq("history previews back to 3", previews(), 3);
  eq("diagram lit arcs back to 4", litArcs(), 4);
  eq("figure wash bands still 1", wash(), 1);

  console.log("— M4: Escape (forget) clears the diagram too —");
  forget();
  await tick();
  eq("diagram held chips", heldChips(), 0);
  eq("diagram far arcs", farArcs(), 0);
  eq("history previews", previews(), 0);

  console.log("— M5: an arrow's hover names it exactly, not its neighbours —");
  const arcAB = arcs().find((a) =>
    a.querySelector("title").textContent.includes("x"),
  );
  enter(arcAB);
  await tick();
  eq("diagram lit arcs (this A→B line alone)", litArcs(), 1);
  eq("editor lit lines (its one rule)", litLines(), 1);
  eq("history previews", previews(), 1);
  leaveP(arcAB);

  console.log("— M5b: code hover lights the diagram, fireable or not —");
  const { CELL } = await server.ssrLoadModule("/src/shared/lib/grid.ts");
  const sheet = editor.shadowRoot.querySelector(".sheet");
  const lineOf = (from, on) =>
    built.rules.find((r) => r.edge.from === from && r.edge.on === on).at;
  const hoverLine = (from, on) =>
    sheet.dispatchEvent(
      new win.window.MouseEvent("mousemove", {
        clientY: (lineOf(from, on) - 1) * CELL + 2,
      }),
    );
  hoverLine("B", "back"); // cannot fire from A
  await tick();
  const arcBA = arcs().find((a) =>
    a.querySelector("title").textContent.includes("back"),
  );
  eq("the unfireable arrow is named", arcBA.classList.contains("lit"), true);
  eq("and still dimmed", arcBA.classList.contains("dim"), true);
  eq("its two ends shine", q(dia, "g.chip.lit"), 2);
  eq("no preview (not a step from here)", previews(), 0);
  hoverLine("A", "loop"); // can fire
  await tick();
  eq("the fireable arrow is named", litArcs(), 1);
  eq("preview of the offered step", previews(), 1);
  sheet.dispatchEvent(new win.window.MouseEvent("mouseleave"));
  await tick();

  console.log("— M5c: pressing where the step can end —");
  click(chip("A"));
  await tick();
  eq("the current state holds", chip("A").classList.contains("held"), true);
  eq(
    "it still wears the standing mark",
    chip("A").classList.contains("here"),
    true,
  );
  eq("shine on the press (A, B, C)", q(dia, "g.chip.lit"), 3);
  forget();
  await tick();
  click(chip("B")); // a target of a fireable arrow: pressable while running
  await tick();
  eq(
    "a reachable target holds too",
    chip("B").classList.contains("held"),
    true,
  );
  forget();
  await tick();

  console.log("— M5d: Escape clears the hover filter with the rest —");
  enter(chip("A"));
  await tick();
  eq("hovering filters", farArcs() > 0, true);
  forget(); // what Escape dispatches
  await tick();
  eq("nothing stays filtered", farArcs(), 0);
  leaveP(chip("A"));
  await tick();

  console.log("— M6: arc click takes and forgets —");
  click(chip("A"));
  await tick();
  click(arcAB);
  await tick();
  eq("machine at", subject.at, "B");
  eq("history bands", q(hist, ".step"), 1);
  eq("diagram held chips (forgotten)", heldChips(), 0);
  eq("diagram far arcs (forgotten)", farChips() + farArcs(), 0);
  eq("dim chips now (reach = B, A)", dimChips(), 2);

  console.log("— M7: history band hover lights the taken rule everywhere —");
  const band = hist.shadowRoot.querySelector(".step");
  band.dispatchEvent(new win.window.MouseEvent("mouseenter"));
  await tick();
  eq("diagram lit arcs (the step's arrow)", litArcs(), 1);
  eq("editor lit lines (the exact rule)", litLines(), 1);
  eq("figure wash bands (both halves)", wash() > 0, true);
  eq("history previews (a recall, not an offer)", previews(), 0);
  band.dispatchEvent(new win.window.MouseEvent("mouseleave"));

  console.log("— M8: keyboard rewind and band click, both forget —");
  click(chip("B"));
  await tick();
  document.dispatchEvent(
    new win.window.KeyboardEvent("keydown", {
      key: "ArrowLeft",
      bubbles: true,
    }),
  );
  await tick();
  eq("ArrowLeft rewinds to", subject.at, "A");
  eq("diagram held chips (forgotten)", heldChips(), 0);
  band.dispatchEvent(new win.window.PointerEvent("click", { bubbles: true }));
  await tick();
  eq("band click lands on its own slice", subject.at, "B");

  console.log("— M9: figure press filters the diagram —");
  const causeCell = [...fig.shadowRoot.querySelectorAll("svg .hot")][0];
  // The figure's own press path: press the first hot cell (a cause of A).
  if (causeCell) click(causeCell);
  await tick();
  eq("figure has a fixed half", focus.look().fixed.length, 1);
  eq("diagram far arcs under the figure's press", farArcs() > 0, true);
  eq("diagram lit arcs under the figure's press", litArcs() > 0, true);
  forget();
  await tick();

  console.log("— M10: editor gutter click fires through the ensemble —");
  click(chip(subject.at)); // hold the current state first
  await tick();
  eq("the press holds", heldChips(), 1);
  const before = subject.at;
  const rows = [...editor.shadowRoot.querySelectorAll(".gutter .row")];
  let fired = false;
  for (const r of rows) {
    click(r);
    await tick();
    if (subject.at !== before) {
      fired = true;
      break;
    }
  }
  eq("a gutter click moved the machine", fired, true);
  eq("selection forgotten after the fire", heldChips(), 0);
  eq("history grew", q(hist, ".step") >= 2, true);

  console.log("— M10b: source pressed, then target — the pair is taken —");
  click(chip("A"));
  await tick();
  click(chip("B"));
  await tick();
  eq("the pair moved the machine", subject.at, "B");
  eq("selection forgotten after the pair", heldChips(), 0);

  console.log("— M10c: the same state twice — the self-loop is taken —");
  click(chip("B")); // back to A first: the pair B → A
  await tick();
  click(chip("A"));
  await tick();
  eq("the pair moved the machine back", subject.at, "A");
  const steps = subject.steps.length;
  click(chip("A"));
  await tick();
  click(chip("A"));
  await tick();
  eq("the self-loop was taken", subject.steps.length, steps + 1);
  eq("still standing on A", subject.at, "A");
  eq("selection forgotten after the pair", heldChips(), 0);

  console.log("— M11: a state out of reach cannot be pressed —");
  const parked = subject.at;
  click(chip("D"));
  await tick();
  eq("no hold on an unreachable state", heldChips(), 0);
  eq("and the machine stands where it stood", subject.at, parked);

  console.log("— M12: the label answers for its arrow —");
  const loopCap = [...dia.shadowRoot.querySelectorAll(".caps text")].find((c) =>
    c.textContent.startsWith("loop"),
  );
  loopCap.dispatchEvent(new win.window.PointerEvent("pointerenter"));
  await tick();
  eq("hovering the label lights its arc", litArcs(), 1);
  loopCap.dispatchEvent(new win.window.PointerEvent("pointerleave"));
  const was = subject.steps.length;
  loopCap.dispatchEvent(
    new win.window.PointerEvent("click", { bubbles: true }),
  );
  await tick();
  eq("clicking the label takes the rule", subject.steps.length, was + 1);

  console.log("— M13: the legends read the alphabet off the subject —");
  const { FsmjsLegend } = await server.ssrLoadModule(
    "/src/widgets/legend/legend.ts",
  );
  const kinds = ["states", "in", "out"];
  const legends = kinds.map((kind) => {
    const one = new FsmjsLegend();
    one.setAttribute("kind", kind);
    document.body.appendChild(one);
    handle.enroll(one);
    return one;
  });
  await tick();
  const words = (l) => l.shadowRoot.querySelectorAll(".word").length;
  eq("states listed", words(legends[0]), 4);
  eq("input events listed", words(legends[1]), 5);
  eq("output events listed", words(legends[2]), 2);
  eq(
    "the current state wears the mark",
    legends[0].shadowRoot.querySelector(".word.here")?.textContent,
    subject.at,
  );

  console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
  process.exitCode = failed ? 1 : 0;
} catch (e) {
  console.error("PROBE ERROR:", e);
  process.exitCode = 1;
}
await server.close();
