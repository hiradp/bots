import assert from "node:assert/strict";
import test from "node:test";
import { stripVTControlCharacters as strip } from "node:util";
import {
  getSelectListTheme,
  initTheme,
  type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, getKeybindings, visibleWidth, type TUI } from "@earendil-works/pi-tui";
import { RadEditor } from "../ui/prompt-editor.ts";
import { testTheme } from "./theme-helpers.ts";

function editor() {
  initTheme("dark", false);
  const theme = testTheme();
  const input = new RadEditor(
    { terminal: { rows: 30, columns: 80 }, requestRender() {} } as unknown as TUI,
    { borderColor: (text) => text, selectList: getSelectListTheme() },
    getKeybindings() as unknown as KeybindingsManager,
    () => theme,
  );
  input.focused = true;
  input.setPaddingX(1);
  return { input, theme };
}

function cursorColumn(lines: string[]): number {
  const line = lines.find((line) => line.includes(CURSOR_MARKER));
  assert.ok(line, "the focused editor must retain its IME cursor marker");
  return visibleWidth(line.slice(0, line.indexOf(CURSOR_MARKER)));
}

test("the prompt gutter preserves wrapped cursor positioning and vertical editing", () => {
  const { input } = editor();
  input.setText("abcdefghijk");
  let lines = input.render(12);
  assert.equal(cursorColumn(lines), 6);
  assert.match(strip(lines[1]!), /^ λ abcdefgh/u);

  input.handleInput("X");
  input.render(12);
  input.handleInput("\x1b[A");
  input.handleInput("Y");
  assert.equal(input.getText(), "abcdYefghijkX");
  lines = input.render(12);
  assert.ok(lines.every((line) => visibleWidth(line) <= 12));

  input.setText("你好🤘");
  assert.equal(cursorColumn(input.render(20)), 9);
  for (const width of [0, 1, 2, 3, 4, 12, 80]) {
    assert.ok(input.render(width).every((line) => visibleWidth(line) <= width));
  }
});

test("only the marker changes for bash mode", () => {
  const { input, theme } = editor();
  input.setText("hello");
  const ordinary = input.render(40);
  assert.ok(ordinary[0]!.includes(theme.getFgAnsi("borderMuted")));
  assert.ok(ordinary[1]!.includes(theme.fg("accent", "λ")));
  // Pi's thinking/bashing border assignments must not recolor the whole frame.
  input.borderColor = () => "LOUD";
  input.setText("!git status");
  const bash = input.render(40);
  assert.equal(bash[0], ordinary[0]);
  assert.ok(bash[1]!.includes(theme.fg("bashMode", "λ")));
  assert.equal(input.getText(), "!git status");
});

test("autocomplete stays selectable and keeps its own styling below the prompt", async () => {
  const { input } = editor();
  input.setAutocompleteProvider({
    getSuggestions: async () => ({
      prefix: "/lo",
      items: [{ value: "/login", label: "login" }],
    }),
    applyCompletion: () => ({ lines: ["/login "], cursorLine: 0, cursorCol: 7 }),
  });
  input.handleInput("/lo");
  await new Promise<void>((resolve) => setImmediate(resolve));
  const lines = input.render(40);
  assert.match(lines.map(strip).join("\n"), /login/u);
  assert.equal(cursorColumn(lines), 6);
  input.handleInput("\t");
  assert.equal(input.getText(), "/login ");
});
