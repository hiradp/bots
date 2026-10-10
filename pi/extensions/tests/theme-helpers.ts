import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";

/** A theme that gives each color token its own 256-color code, so tests can tell tokens apart. */
export function testTheme(): Theme {
  const codes = new Map<ThemeColor, number>();
  const getFgAnsi = (color: ThemeColor) => {
    if (!codes.has(color)) codes.set(color, 16 + codes.size);
    return `\x1b[38;5;${codes.get(color)}m`;
  };
  return {
    name: "test",
    fg: (color: ThemeColor, text: string) => `${getFgAnsi(color)}${text}\x1b[39m`,
    getFgAnsi,
    bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
  } as unknown as Theme;
}
