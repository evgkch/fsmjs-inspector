/**
 * The one way a widget gets its shadow root: the shared base plus its own stylesheet, adopted.
 * Custom properties cross the boundary by inheritance, so `tokens.css` styles the inside; rules
 * do not cross, so the shared ones come in as `shadow.css`. Adopted sheets are parsed once per
 * stylesheet, however many widgets use them.
 */
import base from "../ui/shadow.css?raw";

/** One `CSSStyleSheet` per stylesheet, however many widgets ask for it. */
const sheets = new Map<string, CSSStyleSheet>();

const parse = (css: string): CSSStyleSheet => {
  const had = sheets.get(css);
  if (had) return had;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  sheets.set(css, sheet);
  return sheet;
};

export const shadow = (host: HTMLElement, css: string): ShadowRoot => {
  const root = host.attachShadow({ mode: "open" });
  // Two layers, wrapped here so no sheet writes its own: the base is what a widget's sheet is
  // written against, and a widget that disagrees with it wins. The base's `!important` rules —
  // reduced motion — win back, as important declarations do in a lower layer.
  root.adoptedStyleSheets = [
    parse(`@layer base, widget;\n@layer base {\n${base}\n}`),
    parse(`@layer widget {\n${css}\n}`),
  ];
  return root;
};
