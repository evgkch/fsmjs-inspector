/**
 * The pitch of the rows: a cell of the figure, a lane, a slice of the history. The history
 * continues the figure's rows, so the number is declared once.
 */
export const CELL = 24;

/** The same number handed to the stylesheet, so line-height and cell size cannot drift. */
export const rhythm = (node: HTMLElement): void =>
  node.style.setProperty("--cell", `${CELL}px`);

/** Width of one monospace character at the size the figure's labels use. */
export const EM = 7.2;

/**
 * How far down the first row of states sits — a constant: everything the figure hangs off its
 * indices hangs downwards, so above the first row there is only the one line of index keywords,
 * the same height for every schema. The run starts its rows at the same offset.
 */
export const HEAD = 24;
