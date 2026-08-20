/**
 * The four ways this tool touches the DOM. `svg` is separate from `make` because SVG needs a
 * namespace and takes attributes, not properties.
 */
export const el = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

export const make = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

const SVG = "http://www.w3.org/2000/svg";

export const svg = <K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
  text?: string,
): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
};

/** A word with a class on it, and sometimes a colour. The whole of how this tool writes a rule. */
export const word = (
  text: string,
  cls: string,
  style?: string,
): HTMLElement => {
  const span = make("span", cls, text);
  if (style !== undefined) span.setAttribute("style", style);
  return span;
};
