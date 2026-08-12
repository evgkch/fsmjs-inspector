/**
 * The standalone page: a schema in a textarea, and an inspector pointed at it.
 *
 * Everything about *looking* at a machine is in `inspector.ts` and knows nothing about this page.
 * What is left here is the other half — where the schema comes from, what `analyze` says about
 * its shape, and which state a run starts at — plus one machine of its own, in `page.ts`, for
 * what happens when the text changes.
 */
import { nodes } from "@evgkch/fsmjs";
import { analyze } from "@evgkch/fsmjs/analysis";
import type { Analysis } from "@evgkch/fsmjs/analysis";
import { toRules } from "@evgkch/fsmjs/formatters";
import { mount } from "./inspector.js";
import type { Handle } from "./inspector.js";
import { page } from "./page.js";
import { looksLikeRules, parseRules } from "./rules.js";
import type { Graph } from "./subject.js";
import { fromText } from "./subjects/text.js";
import type { Text } from "./subjects/text.js";
import { SAMPLES, type Sample } from "./samples.js";

const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const area = el<HTMLTextAreaElement>("schema");
const sampleSel = el<HTMLSelectElement>("sample");
const startSel = el<HTMLSelectElement>("start");
const parseEl = el("parse");
const flag = el<HTMLInputElement>("explore");
const host = el("inspector");

let subject: Text | null = null;
let handle: Handle | null = null;

// ── reading the schema ───────────────────────────────────────────────────────

/**
 * Read the editor, then tell the page machine the outcome. The reading happens here so the guard
 * on the other side stays a question about the input rather than a second attempt at it.
 *
 * The editor speaks the library's own language — one sentence per rule, `FROM ON WHEN TO WITH
 * EMIT BY`, the same sentence `toRules` prints and the same one the history writes for every
 * transition. A dump pasted in from `JSON.stringify(machine)` is read too: that is where a schema
 * usually comes from, and refusing it would be a tool being precious.
 */
function read(keep: string): void {
  let graph: Graph | null = null;
  let message = "";
  try {
    if (looksLikeRules(area.value)) {
      graph = parseRules(area.value) as Graph;
    } else {
      const parsed: unknown = JSON.parse(area.value);
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      )
        throw new Error("a schema is an object keyed by state");
      graph = parsed as Graph;
    }
  } catch (e) {
    message = (e as Error).message;
  }
  page.dispatch("parsed", { graph, message, keep });
}

// The page's two outputs are the whole of its effect on the DOM: one says a machine is up, the
// other says the text stopped parsing.
page.rx.on("built", ({ graph, start }) => {
  subject?.stop();
  handle?.destroy();
  subject = fromText(graph, start);
  handle = mount(host, subject, { exploring: flag.checked });
  fillStart(graph, start);
  warn(null);
  shape(analyze(graph, start));
});

page.rx.on("stopped", ({ message }) => warn(message));

function warn(message: string | null): void {
  parseEl.textContent = message ?? "";
  parseEl.hidden = message === null;
}

function fillStart(graph: Graph, start: string): void {
  startSel.replaceChildren(
    ...nodes(graph).map((n) => new Option(n, n, false, n === start)),
  );
  startSel.value = start;
}

/** What `analyze` says about the shape — the part of it no drawing shows better than a list. */
function shape(a: Analysis<string> | null): void {
  const say = (list: readonly string[]) => (list.length ? list.join(" ") : "—");
  el("n-nodes").textContent = a ? say(a.nodes) : "—";
  el("n-reachable").textContent = a ? say(a.reachable) : "—";
  el("n-unreachable").textContent = a ? say(a.unreachable) : "—";
  el("n-terminal").textContent = a ? say(a.terminal) : "—";
}

// ── wiring ───────────────────────────────────────────────────────────────────

function load(s: Sample): void {
  // The files are dumps; what is shown is the language. `toRules` is the writer and `parseRules`
  // the reader, and the editor is the one place the two meet.
  area.value = toRules(JSON.parse(s.json) as object);
  // No start to keep: a schema read fresh runs from the first state it names.
  read("");
}

sampleSel.replaceChildren(
  ...SAMPLES.map((s, i) => new Option(s.name, String(i))),
);
sampleSel.addEventListener("change", () =>
  load(SAMPLES[Number(sampleSel.value)]!),
);

let timer = 0;
area.addEventListener("input", () => {
  clearTimeout(timer);
  timer = window.setTimeout(() => read(startSel.value), 300);
});

startSel.addEventListener("change", () =>
  page.dispatch("begin", { start: startSel.value }),
);

flag.addEventListener("change", () => handle?.set({ exploring: flag.checked }));

// What this is, said once, where a tool says such things.
console.log(
  "%cfsmjs inspector%c\n" +
    "A machine's graph is a projection of the machine itself: JSON.stringify keeps the labels\n" +
    "and writes the name of every operation in place of its code. What is left is enough to draw\n" +
    "the machine, to check it — and, with no operations in it at all, to still run it.\n" +
    "https://github.com/evgkch/fsmjs-inspector",
  "font-weight:700",
  "font-weight:400",
);

load(SAMPLES[0]!);
