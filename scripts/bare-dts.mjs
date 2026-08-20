// The declarations, stripped of their stylesheets. `tsc` copies a side-effect `import "./x.css"`
// into the `.d.ts` it emits, and a consumer checking with `skipLibCheck: false` and no bundler
// types has no declaration for a stylesheet to find (TS2882). The import carries no types, so a
// declaration loses nothing by dropping it; the imports in the built JavaScript stay where they
// were. Runs after `tsc` in `build:lib`.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );

for (const file of walk("dist-lib")) {
  if (!file.endsWith(".d.ts")) continue;
  const text = readFileSync(file, "utf8");
  const bare = text.replace(/^import "[^"\n]*\.css";\n/gm, "");
  if (bare !== text) writeFileSync(file, bare);
}
