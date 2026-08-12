import { defineConfig } from "vite";

/**
 * The package, as opposed to the page. `vite.config.ts` builds the standalone site out of
 * `index.html`; this builds `src/index.ts` into something another application can import.
 *
 * The library is left out of the bundle: whoever embeds the inspector already has a machine, and
 * a second copy of `fsmjs` would be a second `TRANSITION` symbol — the listener would never fire.
 */
export default defineConfig({
  build: {
    outDir: "dist-lib",
    lib: { entry: "src/index.ts", formats: ["es"], fileName: "index" },
    rollupOptions: {
      external: [/^@evgkch\//],
    },
  },
});
