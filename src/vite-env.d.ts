// A widget imports the stylesheet beside it as raw text, to inject into its own shadow root. The
// standalone page imports schemas the same way through `vite/client`; the library build turns that
// off (`types: []`), so this is the one declaration the widgets need in both.
declare module "*.css?raw" {
  const source: string;
  export default source;
}
