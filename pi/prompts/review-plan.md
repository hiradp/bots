---
description: "Review a plan with two parallel reviewers: Astra and Sol 6.1"
argument-hint: "[additional instructions]"
---

Review authorization: /review-plan

Run exactly one read-only review pass over the latest complete implementation plan in this conversation. Use both required reviewers in one parallel `subagent` call. Do not bypass an unavailable or refused model, retry a failed pass, or silently omit a reviewer.

Additional instructions: ${@:-none}

1. Identify the complete plan, original requirements, relevant repository, and prior review findings. If the plan is missing or ambiguous, ask rather than reviewing the wrong artifact. Read the existing plan file once when it matches the intended plan; otherwise use the complete conversational plan. Both reviewers require the complete plan text in their tasks.
2. Keep pre-dispatch work bounded to identifying the plan and known context paths. Do not pre-review the plan, investigate every implementation claim, or compose a self-contained evidence packet in the parent. Give reviewers concise requirements and scope, plus references to existing context documents and known relevant source files. Reviewers investigate independently; the parent verifies findings after they return.
3. Use exactly one `subagent` call with two parallel `tasks`, all using user `plan-reviewer`:
   - model `openai-codex/gpt-6-astra`, label `Plan review · Astra`.
   - model `openai-codex/gpt-6.1-sol`, label `Plan review · Sol 6.1`.
4. Start each task with `Review authorization: /review-plan`. Give each reviewer the same plan, requirements, scope, additional instructions, and prior findings. Include the complete plan text in each reviewer's task to satisfy its eligibility gate. Ask for a full independent plan review; do not share current reviewers' output with one another.
5. Wait for the combined result. A failed, canceled, timed-out, empty, unsupported, or otherwise unusable pass makes the review incomplete. Identify failed or unstarted passes and stop without retrying, synthesizing a successful review, or saying `No confirmed findings.` Treat truncated reviewer output as incomplete if the full findings are unavailable. Another pass requires a new explicit invocation of this command.
6. After both passes return usable output, load the review skill and verify allegations against the plan and repository. Deduplicate overlaps, discard ungrounded claims, and retain meaningful disagreements as questions. Report confirmed findings first by severity, with reviewer/model attribution; then questions, prior-finding dispositions, testing gaps, and review coverage. Record the target and both outcomes, including any coverage limitations. If no confirmed defects remain, say `No confirmed findings.`
7. Synthesis is a mandatory result of a successful dispatch. If steering or follow-up input arrives after results but before synthesis, present the review first and defer the new request. Never let queued input hide findings.

Do not edit the plan, repository files, Git state, or external systems. Stop after reporting; do not fix findings or automatically re-review revisions.
