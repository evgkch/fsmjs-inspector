/**
 * Write the inspector's own machines into `schemas/`, as `JSON.stringify` writes them.
 *
 * The page's claim is that a machine's graph is a projection of the machine itself, and the
 * shortest way to make that claim checkable is to hand the page its own machines to read. These
 * three are not written by hand and must not be: they are dumps, produced by the same `toJSON`
 * the page is about, so they cannot drift from the code they came from. `npm run build` runs
 * this first, which is what keeps that true.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { newDiagram } = await import("../src/diagram.ts");
const { page } = await import("../src/page.ts");

// One diagram per figure, so there is no module-level pair to reach for: the dump asks for one
// the same way a mount does.
const { choice, pointer } = newDiagram();

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
