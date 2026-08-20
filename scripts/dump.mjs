/**
 * Write the inspector's own machines into `schemas/`, as `JSON.stringify` writes them. Produced
 * dumps, never hand-written, so they cannot drift from the code; `npm run build` runs this
 * first. Loaded through Vite because the modules import their neighbours the way the rest of the
 * tool does.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createServer } from "vite";
import { format, resolveConfig } from "prettier";

/** `validate` over a machine's own dump; anything found fails the build. */
let bad = 0;

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "warn",
});

const { newFocus } = await vite.ssrLoadModule(
  "/src/features/focus/model/focus.ts",
);
const { page } = await vite.ssrLoadModule(
  "/src/features/read-schema/model/page.ts",
);
const { newWriting } = await vite.ssrLoadModule(
  "/src/features/write-rules/model/writing.ts",
);
const { newDrag } = await vite.ssrLoadModule(
  "/src/features/drag-panel/model/drag.ts",
);
const { newSight } = await vite.ssrLoadModule(
  "/src/pages/inspector/model/showing.ts",
);
const { newPanels } = await vite.ssrLoadModule(
  "/src/features/show-panels/model/panels.ts",
);
const { newWatching } = await vite.ssrLoadModule(
  "/src/pages/viewer/model/watching.ts",
);
const { validate } = await vite.ssrLoadModule("@evgkch/fsmjs/analysis");
const { formatIssues } = await vite.ssrLoadModule("@evgkch/fsmjs/formatters");

const check = (name, machine) => {
  const issues = validate(
    JSON.parse(JSON.stringify(machine)),
    machine.state.type,
  );
  if (!issues.length) return;
  bad += issues.filter((i) => i.severity === "error").length;
  console.error(`${name}:\n${formatIssues(issues)}`);
};

const { choice, pointer } = newFocus();

const here = dirname(fileURLToPath(import.meta.url));

// Laid out by the repository's own formatter, so a fresh dump passes `format:check`.
const style = await resolveConfig(join(here, "..", ".prettierrc.json"));

for (const [file, machine] of [
  ["the-inspectors-choice.json", choice],
  ["the-inspectors-pointer.json", pointer],
  ["the-inspectors-page.json", page],
  ["the-inspectors-editor.json", newWriting()],
  ["the-inspectors-panel.json", newDrag()],
  ["the-inspectors-sight.json", newSight()],
]) {
  check(file, machine);
  const text = await format(JSON.stringify(machine), {
    ...style,
    filepath: file,
  });
  writeFileSync(join(here, "..", "schemas", file), text);
  console.log(`${file}  ${text.length} bytes`);
}

// Not dumped — the pages' own machines — but held to the same check.
check("show-panels", newPanels());
check("watching", newWatching());

await vite.close();
if (bad) process.exit(1);
