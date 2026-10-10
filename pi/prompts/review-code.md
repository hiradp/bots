---
description: "Review code with three parallel reviewers: Astra and Sol 6.1"
argument-hint: "[target or additional instructions]"
---

Review authorization: /review-code

Run exactly one read-only review pass over ${@:-the current working-tree change}. Use all three required reviewers in one parallel `subagent` call. Do not bypass an unavailable or refused model, retry a failed pass, or silently omit a reviewer.

1. Establish the exact target and original requirements using the conversation and a brief read-only snapshot check. For uncommitted work, record `HEAD`, staged/unstaged state, and relevant untracked paths. For a branch or PR, resolve the intended base and head to full immutable commit SHAs available locally; do not substitute the working tree for a committed target. Ask if the target is ambiguous or unavailable.
2. Keep pre-dispatch work bounded to target selection and known context paths. Do not perform a preliminary code review, trace every caller, read every test/log, or compose a self-contained evidence packet in the parent. Put concise requirements, scope, and prior findings in each task; pass existing plans, context documents, callers, and test evidence as file references rather than copying their contents. Reviewers investigate independently; the parent verifies findings after they return.
3. Use exactly one `subagent` call with three parallel `tasks`, all using user `code-reviewer`:
   - model `openai-codex/gpt-6-astra`, label `Correctness · Astra`, primary focus `correctness/completeness`.
   - model `openai-codex/gpt-6-astra`, label `Simplicity · Astra`, primary focus `simplicity`.
   - model `openai-codex/gpt-6.1-sol`, label `Correctness · Sol 6.1`, primary focus `correctness/completeness`.
4. Start each task with `Review authorization: /review-code` and its exact `Primary focus:` line. Give each reviewer the same target, intent, requirements, and prior findings. Do not include another current reviewer's output. Keep the simplicity pass scoped to changed code and concrete simplifications rather than repeating the correctness checklist. For rollout-, version-skew-, feature-flag-, or configuration-sensitive targets, ask the correctness reviewers to examine plausible partial-rollout, rollback, flag-disable, and schema-admitted configuration paths proportionately.
5. Wait for the combined result. A failed, canceled, timed-out, empty, unsupported, or otherwise unusable pass makes the review incomplete. Identify failed or unstarted passes and stop without retrying, synthesizing a successful review, or saying `No confirmed findings.` Treat truncated reviewer output as incomplete if the full findings are unavailable. Another pass requires a new explicit invocation of this command.
6. After all three passes return usable output, load the review skill and verify each allegation and redundant-test candidate against the exact target. Deduplicate overlaps, discard ungrounded claims and style preferences, and retain meaningful disagreements as questions. Check that working-tree findings still refer to the reviewed state; disclose changes rather than claiming a stale review covers them.
7. Report confirmed findings first, ordered by severity, with reviewer/model/focus attribution. Follow with questions, prior-finding dispositions, testing gaps, redundant tests, and review coverage as applicable. Keep removable low-value tests separate from defects. Record the reviewed revision/state and all three pass outcomes, including any coverage limitations. If no confirmed defects remain, say `No confirmed findings.`
8. Synthesis is a mandatory result of a successful dispatch. If steering or follow-up input arrives after results but before synthesis, present the review first and defer the new request. Never let queued input hide findings.

Do not modify code, Git state, or external systems. Stop after reporting; do not fix findings or automatically re-review revisions.
