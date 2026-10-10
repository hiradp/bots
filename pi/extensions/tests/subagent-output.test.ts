import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  SessionManager,
  type ExtensionAPI,
  type ExtensionToolContext,
  type Theme,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { AssistantMessage, JsonValue } from "@earendil-works/pi-ai";
import registerSubagent, {
  formatParallelOutput,
  substitutePrevious,
  truncateOutput,
} from "../subagent/index.ts";

type Renderable = { render(width: number): string[] };

function captureRenderers() {
  let renderCall: ((args: any, theme: Theme, context: any) => Renderable) | undefined;
  let renderResult:
    | ((result: any, options: any, theme: Theme, context: any) => Renderable)
    | undefined;
  registerSubagent({
    on() {},
    registerTool(definition: {
      renderCall?: typeof renderCall;
      renderResult?: typeof renderResult;
    }) {
      renderCall = definition.renderCall;
      renderResult = definition.renderResult;
    },
  } as unknown as ExtensionAPI);
  assert.ok(renderCall);
  assert.ok(renderResult);
  return { renderCall, renderResult };
}

const plainTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

const emptyUsage = {
  total: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
  contextTokens: 0,
  turns: 0,
};

test("renders task text through the sanitiser in every view", () => {
  const { renderCall, renderResult } = captureRenderers();
  const unsafeTask = "Inspect\u001b[2A the \u009b3Bbuild\u0007 output";
  const context = { state: {}, lastComponent: undefined, invalidate() {}, toolCallId: "call" };

  const call = renderCall({ agent: "worker", task: unsafeTask }, plainTheme, context)
    .render(100)
    .join("\n");
  assert.match(call, /Inspect the build output/);
  assert.equal(call.includes("\u001b[2A"), false);

  const result = (agent: string, step?: number) => ({
    agent,
    agentSource: "user",
    task: unsafeTask,
    exitCode: 0,
    messages: [],
    stderr: "",
    usage: emptyUsage,
    stopReason: "stop",
    step,
  });
  for (const details of [
    { mode: "single", results: [result("worker")] },
    { mode: "chain", results: [result("worker", 1), result("worker", 2)] },
    { mode: "parallel", results: [result("worker"), result("worker")] },
  ]) {
    const rendered = renderResult(
      {
        content: [{ type: "text", text: "done" }],
        details: { ...details, agentScope: "user", projectAgentsDir: null },
      },
      { expanded: true, isPartial: false },
      plainTheme,
      { ...context, toolCallId: details.mode },
    )
      .render(100)
      .join("\n");
    assert.match(rendered, /Inspect the build output/, details.mode);
    assert.equal(rendered.includes("\u001b"), false, details.mode);
    assert.equal(rendered.includes("\u009b"), false, details.mode);
  }
});

test("renders child tool calls with non-string arguments", () => {
  const { renderResult } = captureRenderers();
  const rendered = renderResult(
    {
      content: [{ type: "text", text: "done" }],
      details: {
        mode: "single",
        agentScope: "user",
        projectAgentsDir: null,
        results: [
          {
            agent: "worker",
            agentSource: "user",
            task: "Write config",
            exitCode: 0,
            stopReason: "stop",
            messages: [
              {
                role: "assistant",
                content: [
                  {
                    type: "toolCall",
                    name: "write",
                    arguments: { file_path: 42, content: { nested: true } },
                  },
                  { type: "toolCall", name: "read", arguments: { path: null, offset: "3" } },
                  { type: "text", text: "Wrote it" },
                ],
              },
            ],
            stderr: "",
            usage: emptyUsage,
          },
        ],
      },
    },
    { expanded: true, isPartial: false },
    plainTheme,
    { state: {}, lastComponent: undefined, invalidate() {}, toolCallId: "write" },
  )
    .render(100)
    .join("\n");

  assert.match(rendered, /→ write/);
  assert.match(rendered, /→ read/);
  assert.match(rendered, /Wrote it/);
});

test("truncation notice states what was omitted without promising hidden output", () => {
  const truncated = truncateOutput("x".repeat(5000), 1024);

  assert.match(truncated, /\[Output truncated: \d+ bytes omitted\.\]$/);
  assert.doesNotMatch(truncated, /tool details/);
});

function assistant(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "test",
    provider: "test",
    model: "test",
    usage: emptyUsage.total,
    stopReason: "stop",
    timestamp: 1,
  };
}

function fullResults(text: string) {
  return Array.from({ length: 4 }, (_, index) => ({
    agent: "code-reviewer",
    agentSource: "user" as const,
    task: "Review",
    label: `Reviewer ${index}`,
    exitCode: 0,
    messages: [assistant(text)],
    stderr: "",
    usage: emptyUsage,
    stopReason: "stop",
    coverage: index === 3 ? ["Selected lines only", "Binary files excluded"] : undefined,
  }));
}

function references(text: string) {
  return [...text.matchAll(/^Full-result reference: (.+)$/gm)].map((match) => JSON.parse(match[1]));
}

function assertBounded(text: string) {
  assert.ok(Buffer.byteLength(text, "utf8") <= 50 * 1024);
  assert.ok(text.split("\n").length <= 2000);
  assert.equal(Buffer.from(text, "utf8").toString("utf8"), text);
  assert.equal(text.includes("\ufffd"), false);
}

test("parallel Pi reviewers use their selected models and preserve complete findings beyond output limits", async (t) => {
  for (const line of ["Review \ud83d\udd0e: " + "\u754c".repeat(40) + "\n", "\ud83d\udd0e\n"]) {
    await t.test(`aggregate limited by ${line.length > 10 ? "bytes" : "lines"}`, async (t) => {
      const directory = await mkdtemp(join(tmpdir(), "subagent-output-"));
      const agentDir = join(directory, "agent");
      const env = { dir: process.env.PI_CODING_AGENT_DIR, depth: process.env.PI_SUBAGENT_DEPTH };
      t.after(async () => {
        if (env.dir === undefined) delete process.env.PI_CODING_AGENT_DIR;
        else process.env.PI_CODING_AGENT_DIR = env.dir;
        if (env.depth === undefined) delete process.env.PI_SUBAGENT_DEPTH;
        else process.env.PI_SUBAGENT_DEPTH = env.depth;
        await rm(directory, { recursive: true, force: true });
      });
      process.env.PI_CODING_AGENT_DIR = agentDir;
      delete process.env.PI_SUBAGENT_DEPTH;
      await mkdir(join(agentDir, "agents"), { recursive: true });
      await writeFile(
        join(agentDir, "agents", "plan-reviewer.md"),
        "---\nname: plan-reviewer\ndescription: Review\n---\nReview supplied evidence.",
      );
      const repeated = line.repeat(Math.floor((50 * 1024 - 20) / Buffer.byteLength(line)));
      const suffix = `${"x".repeat(50 * 1024 - Buffer.byteLength(repeated) - 13)}FINAL FINDING`;
      const findings = repeated + suffix;
      assert.equal(Buffer.byteLength(findings), 50 * 1024);
      const message = assistant(findings);
      message.content = [
        { type: "text", text: repeated },
        { type: "thinking", thinking: "not findings" },
        { type: "text", text: suffix },
      ];
      const models = [
        "openai-codex/gpt-6-astra",
        "openai-codex/gpt-6-astra",
        "openai-codex/gpt-6.1-sol",
      ];
      const dispatchedModels: string[] = [];
      let tool: ToolDefinition | undefined;
      registerSubagent(
        {
          on() {},
          registerTool(definition: ToolDefinition) {
            tool = definition;
          },
        } as unknown as ExtensionAPI,
        undefined,
        (args) => {
          dispatchedModels.push(args[args.indexOf("--model") + 1]);
          return {
            command: process.execPath,
            args: [
              "-e",
              `for (const message of ${JSON.stringify([assistant("Earlier analysis"), message])}) console.log(JSON.stringify({type:'message_end',message}));`,
            ],
          };
        },
      );
      const session = SessionManager.create(directory, join(directory, "sessions"));
      session.appendMessage({
        role: "user",
        content: "Review authorization: /review-plan",
        timestamp: 1,
      });
      const toolCallId = "review-call-exact";
      session.appendMessage({
        ...assistant(""),
        content: [{ type: "toolCall", id: toolCallId, name: "subagent", arguments: {} }],
        stopReason: "toolUse",
      });
      const tasks = models.map((model, index) => ({
        agent: "plan-reviewer",
        label: `Reviewer ${index}`,
        model,
        task: "Review authorization: /review-plan\nReview the plan.",
      }));
      assert.ok(tool);
      const output = await tool.execute(toolCallId, { tasks }, undefined, undefined, {
        cwd: directory,
        sessionManager: session,
      } as unknown as ExtensionToolContext);
      session.appendMessage({
        role: "toolResult",
        toolName: "subagent",
        toolCallId,
        ...output,
        details: output.details as JsonValue,
        isError: false,
        timestamp: 2,
      });
      const text = output.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("");
      assertBounded(text);
      if (line.length > 10) assert.ok(Buffer.byteLength(text) > 45 * 1024);
      else assert.ok(text.split("\n").length > 1900);
      const refs = references(text);
      assert.equal(refs.length, models.length);
      assert.deepEqual([...dispatchedModels].sort(), [...models].sort());
      const details = output.details as { results: ReturnType<typeof fullResults> };
      assert.ok(details.results.every((result) => result.exitCode === 0));
      for (const [index, ref] of refs.entries()) {
        assert.equal(ref.toolCallId, toolCallId);
        assert.equal(ref.resultIndex, index);
        const entries = (await readFile(ref.sessionFile, "utf8"))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
        const saved = entries.find(
          (entry) =>
            entry.type === "message" &&
            entry.message.role === "toolResult" &&
            entry.message.toolName === "subagent" &&
            entry.message.toolCallId === ref.toolCallId,
        );
        const result = saved.message.details.results[ref.resultIndex];
        const recovered = result.messages
          .findLast((message: AssistantMessage) => message.role === "assistant")
          .content.filter((part: { type: string }) => part.type === "text")
          .map((part: { text: string }) => part.text)
          .join("");
        assert.equal(recovered, findings);
        assert.equal(result.model, models[index]);
      }
    });
  }
});

test("in-memory truncation identifies live results without inventing a saved path", () => {
  const session = SessionManager.inMemory();
  const output = formatParallelOutput(
    fullResults("\ud83d\udd0e\n".repeat(11_000)),
    "memory-call",
    session.getSessionFile(),
  );

  assertBounded(output);
  assert.match(output, /no saved session file or filesystem retrieval/);
  assert.match(output, /incomplete/);
  assert.deepEqual(
    references(output),
    [0, 1, 2, 3].map((resultIndex) => ({ toolCallId: "memory-call", resultIndex })),
  );
  assert.ok(output.includes("Binary files excluded"));
});

test("oversized coverage is explicitly incomplete without hiding failure diagnostics or full-result locators", () => {
  for (const coverage of ["\u754c".repeat(20_000), "Excluded file\n".repeat(2000)]) {
    const results = fullResults("Finding\n".repeat(7000));
    results[3].coverage = [coverage];
    results[2].exitCode = 1;
    results[2].stopReason = "error";
    results[2].stderr = "Reviewer transport disconnected";

    const output = formatParallelOutput(results, "oversized-call", "/session.jsonl");

    assertBounded(output);
    assert.match(output, /3\/4 succeeded/);
    assert.match(output, /Packet coverage: INCOMPLETE/);
    assert.ok(output.includes(results[2].stderr));
    assert.equal(references(output).length, 4);
    assert.equal(results[3].coverage[0], coverage);
  }
});

test("chain steps receive previous output verbatim, including dollar sequences", () => {
  const previous = "cost $$ and $& then $` plus $' end";

  assert.equal(
    substitutePrevious("Start {previous} again {previous}", previous),
    `Start ${previous} again ${previous}`,
  );
  assert.equal(substitutePrevious("No placeholder", previous), "No placeholder");
});
