---
name: review-code
description: Review code with four parallel reviewers (Opus, Sonnet, and GPT-6 Astra), then verify and merge their findings. Use only when the user invokes /review-code.
argument-hint: "[target or additional instructions]"
disable-model-invocation: true
---

# Review code

Run exactly one read-only review pass over $ARGUMENTS, or the current working-tree change when no target is given. Do not bypass an unavailable backend, retry a failed pass, or silently omit a reviewer.

| Pass | Runs as | Focus |
|---|---|---|
| Correctness · Opus | `code-reviewer` subagent | `correctness/completeness` |
| Simplicity · Sonnet | `code-reviewer` subagent, model `sonnet` | `simplicity` |
| Correctness · Astra | `codex exec` | `correctness/completeness` |
| Simplicity · Astra | `codex exec` | `simplicity` |

Both files live under the Claude config dir, `${CLAUDE_CONFIG_DIR:-$HOME/.claude}`. Expand them to absolute paths before dispatch, without resolving symlinks:

- Review skill: `<config dir>/skills/review/SKILL.md`
- Reviewer brief: `<config dir>/agents/code-reviewer.md`

## 1. Establish the target

Use the conversation and a brief read-only snapshot check to establish the exact target and original requirements. For uncommitted work, record `HEAD`, staged and unstaged state, and relevant untracked paths. For a branch or PR, resolve the intended base and head to full commit SHAs available locally; do not substitute the working tree for a committed target. Ask if the target is ambiguous or unavailable.

Keep pre-dispatch work bounded to target selection and known context paths. Do not perform a preliminary review, trace callers, read every test or log, or compose an evidence packet. Reviewers investigate independently; you verify their findings afterwards.

## 2. Write the tasks

Write one task per pass to a file in the scratchpad directory. Each task starts with:

```text
Review authorization: /review-code
Primary focus: <focus>
Review skill: <absolute path>
```

Then give every pass the same content: repository root, target kind and SHAs (plus staged, unstaged, and untracked state for a working tree), intent and requirements, prior findings, and paths to existing plans, context documents, callers, or test evidence. Pass files by path rather than pasting their contents. Never include another reviewer's output.

For rollout-, version-skew-, feature-flag-, or configuration-sensitive targets, ask the correctness passes to examine plausible partial-rollout, rollback, flag-disable, and schema-admitted configuration paths proportionately. Keep the simplicity pass scoped to changed code and concrete simplifications.

Astra has no subagent definition, so its tasks also start with:

```text
Reviewer brief: <absolute path>. Read it before anything else and follow it as your instructions; ignore its frontmatter.
```

## 3. Dispatch all four passes in one message

- **Opus:** an Agent call with subagent type `code-reviewer` and the Opus task as its prompt.
- **Sonnet:** an Agent call with subagent type `code-reviewer`, model `sonnet`, and the Sonnet task as its prompt.
- **Astra:** one background Bash call per pass:

  ```bash
  codex exec --sandbox read-only -C "<repo root>" -m gpt-6-astra \
    -c model_reasoning_effort=high -o "<scratch>/astra-<focus>.md" - \
    < "<scratch>/task-astra-<focus>.md" > "<scratch>/astra-<focus>.log" 2>&1
  ```

  Don't add `--ephemeral`: the saved Codex session is how `bots report` counts the pass's usage. Never add flags that widen the sandbox, such as `--add-dir`, `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox`. The read-only sandbox lets Astra read any path and run read-only Git commands. It blocks writes.

## 4. Wait for every pass

A failed, canceled, timed-out, empty, unsupported, or truncated pass makes the review incomplete. An Astra pass is usable only when `codex exec` exits 0 and its `-o` file holds the review; use the log only to diagnose failures. If any pass is unusable, report which passes failed or did not start and stop without retrying, synthesizing a review from the rest, or saying `No confirmed findings.` Another pass requires a new explicit invocation.

## 5. Verify and synthesize

After all four passes return usable output, load the `review` skill and verify each allegation and redundant-test candidate against the exact target. Deduplicate overlaps, discard ungrounded claims and style preferences, and keep meaningful disagreements as questions. For a working-tree target, check that findings still refer to the reviewed state; disclose changes made during the review rather than claiming the review covers them.

Report confirmed findings first, ordered by severity, with reviewer and focus attribution. Follow with questions, a short `Dropped` list giving each discarded pass allegation a one-line reason, prior-finding dispositions, testing gaps, redundant tests, and review coverage as applicable. Keep removable low-value tests separate from defects. In review coverage, record the reviewed revision or state, one line of pass outcomes (with detail only for a failed or limited pass), and the checks that were or weren't run. If no confirmed defects remain, say `No confirmed findings.`

Synthesis is mandatory after a successful dispatch. If new input arrives after the results but before synthesis, present the review first and defer the new request.

Do not modify code, Git state, or external systems. Stop after reporting; do not fix findings or re-review automatically.
