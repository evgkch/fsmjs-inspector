/**
 * Write the inspector's own machines into `schemas/`, as `JSON.stringify` writes them.
 *
 * The page's claim is that a machine's graph is a projection of the machine itself, and the
 * shortest way to make that claim checkable is to hand the page its own machines to read. These
 * three are not written by hand and must not be: they are dumps, produced by the same `toJSON`
 * the page is about, so they cannot drift from the code they came from. `npm run build` runs
 * this first, which is what keeps that true.
 *
 * They are loaded through Vite rather than by node itself, because a machine that lives in a
 * slice imports its neighbours the way the rest of the tool does, and resolving those is the
 * bundler's job — not something to be worked around by keeping these two files import-free.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createServer } from "vite";

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

// One focus per figure, so there is no module-level pair to reach for: the dump asks for one
// the same way a mount does.
const { choice, pointer } = newFocus();

const here = dirname(fileURLToPath(import.meta.url));

for (const [file, machine] of [
  ["the-inspectors-choice.json", choice],
  ["the-inspectors-pointer.json", pointer],
  ["the-inspectors-page.json", page],
]) {
  const text = JSON.stringify(machine, null, 2) + "\n";
  writeFileSync(join(here, "..", "schemas", file), text);
  console.log(`${file}  ${text.length} bytes`);
}

await vite.close();
