import { defineConfig } from "vite";

/**
 * The package, as opposed to the page. `vite.config.ts` builds the standalone site out of
 * `index.html`; this builds `src/index.ts` into something another application can import.
 *
 * The library is left out of the bundle: whoever embeds the inspector already has a machine, and
 * a second copy of `fsmjs` would be a second `TRANSITION` symbol — the listener would never fire.
 *
 * Two entries, and the second one is the point of having two: `publish` is what an application
 * being watched imports, and an application being watched may have no document — a server, a
 * worker, a test run. `index` carries a stylesheet and builds a page; nothing that only says what a
 * machine did should have to load it.
 */
export default defineConfig({
  build: {
    outDir: "dist-lib",
    lib: {
      entry: { index: "src/index.ts", publish: "src/publish.ts" },
      formats: ["es"],
    },
    rollupOptions: {
      external: [/^@evgkch\//],
      // The stylesheet is named after the entry that carries it, not after the package: with one
      // entry it was `index.css` and `./style.css` in the manifest points at it, and adding a
      // second entry is no reason for a file somebody imports by name to be called something else.
      output: { assetFileNames: "index[extname]" },
    },
  },
});
