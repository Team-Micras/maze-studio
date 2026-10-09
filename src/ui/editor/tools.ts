/**
 * The editor's tools (DESIGN.md 4, 9.2 and 11): what each is called, its key, and the hint shown
 * when it is picked.
 *
 * @module
 */

/** A tool of the tools island. */
export type Tool = 'hand' | 'wall' | 'rectangle' | 'clear' | 'start' | 'goal';

/** What the island and the shortcuts say about a tool. */
export interface ToolInfo {
  readonly tool: Tool;
  readonly label: string;
  /** Its key, a single capital letter. */
  readonly key: string;
  readonly hint: string;
}

const INFO: Readonly<Record<Tool, Omit<ToolInfo, 'tool'>>> = {
  hand: { label: 'Hand', key: 'H', hint: 'Drag to pan' },
  wall: { label: 'Wall', key: 'W', hint: 'Click a slot to toggle. Drag to draw walls' },
  rectangle: {
    label: 'Rectangle',
    key: 'R',
    hint: 'Drag to wall in a rectangle, or press Enter at two corners',
  },
  clear: {
    label: 'Clear area',
    key: 'C',
    hint: 'Drag to clear the walls inside, or press Enter at two corners',
  },
  start: { label: 'Start', key: 'S', hint: 'Click a cell, or press Enter, to put the start' },
  goal: {
    label: 'Goal',
    key: 'G',
    hint: 'Click for one goal cell, drag for an area. Shift and click add or remove a cell',
  },
};

const ORDER: readonly Tool[] = ['hand', 'wall', 'rectangle', 'clear', 'start', 'goal'];

/** What is said about `tool`. */
export function toolInfo(tool: Tool): ToolInfo {
  return { tool, ...INFO[tool] };
}

/** The tools in the island's order. */
export const TOOLS: readonly ToolInfo[] = ORDER.map(toolInfo);

/** Whether `value` names a tool. */
export function isTool(value: string): value is Tool {
  return value in INFO;
}

/** The tool of a key, in either case. */
export function toolOfKey(key: string): Tool | undefined {
  return TOOLS.find((info) => info.key === key.toUpperCase())?.tool;
}
