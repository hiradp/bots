---
name: create-pr
description: Create or prepare a GitHub pull request from the current repository and branch. Use when the user asks to open, create, draft, or prepare a PR or its description.
---

# Create PR

Create one focused pull request from the current repository while preserving the user's scope, voice, and safety constraints.

## Intent and authorization

- Treat an explicit request to **open** or **create** a PR as authorization for a normal push of the current task's non-default feature branch, if needed, followed by one `gh pr create`. This authorization remains valid when implementation is delegated to subagents; do not ask the user to repeat it after they return. The harness's safety policy and repository rules still apply.
- A request to **prepare** or **draft a description** is local-only unless the user explicitly asks to publish it.
- Honor read-only constraints such as "don't post", "review only", or "don't push".
- PR creation does **not** authorize force-pushing, merging, closing or reopening PRs, commenting, editing unrelated PRs, changing branch protection, deploying, or publishing releases.
- Work only in the current repository unless the user explicitly names another repository.
- Ask before acting when the repository, head branch, base branch, task scope, or ownership of uncommitted changes is genuinely ambiguous.

## Inspect before mutation

1. Read the repository instructions and locate its PR template. Prefer the repository's template and preserve its section order.
2. Inspect the complete local state:
   - current branch and upstream
   - remotes and repository identity
   - `git status --short`
   - commits and diff relative to the intended base
3. Check whether the current branch already has a PR. This is read-only preparation. If one exists, report it instead of creating a duplicate; do not edit it unless requested.
4. Determine the base branch deliberately:
   - use a base explicitly named by the user;
   - for a stacked change, use the actual parent branch or PR;
   - otherwise use the repository's normal default branch.
5. Verify that `base...HEAD` contains only the intended change. Do not rebase, merge, switch branches, or retarget an existing PR merely to make creation convenient.
6. Account for every uncommitted change. When the user requested an end-to-end implementation followed by a PR, task-scoped commits are allowed. For a standalone "open a PR" request, do not silently absorb unrelated or unexplained changes.
7. Load the `test-quality` skill and run the repository's required checks, plus checks sufficient to exercise the changed contract. Follow its blocker-recovery workflow before declaring validation unavailable. Never claim coverage from checks that were skipped or never started.

## High-risk readiness

Apply these rules when a defect in the change could cause an outage, data loss, security exposure, unsafe rollout, or major compatibility break. If the `high-risk-completion` skill is available, load and follow it as well.

- An implementation or PR request does not authorize an independent code review or reviewer subagents; run one only when the user asks for it.
- A high-risk change without a current successful independent review is not review-ready or merge-ready, even when checks pass and GitHub reports it as conflict-free.
- When the user requests a PR without specifying draft or ready status, publish an unreviewed high-risk change as a draft and report that independent review is pending. Do not withhold the requested draft merely to request review first.
- If the user explicitly requests a ready PR before review, explain the missing gate and ask whether to publish a draft or intentionally bypass it.
- Do not mark an existing draft ready until the gate passes or the user explicitly confirms an override.
- Review findings returned by a reviewer tool remain unresolved even if a queued user message arrived before the parent synthesized them. If confirmed findings have not yet been surfaced to the user, report them and stop before any push or PR mutation. After they have been surfaced, an explicitly requested PR may be published only as a draft while they remain unresolved.

## Title and description

- Inspect recent repository PR titles when necessary to match local conventions.
- Use a concise, specific title in the repository's established style.
- Write the body by the "Writing for others" rules in the global instructions.
- Follow the PR template rather than inventing a competing format.
- Explain the reason for the change and the meaningful implementation details.
- Do not add a testing section for routine unit or integration tests, linters, type checks, builds, or other validation expected to run in CI.
- If the repository template requires a testing section, preserve it. When only routine validation was performed, write `CI.` and never enumerate routine commands or checks.
- Add testing details only when a novel, manual, or environment-specific check gives reviewers information that CI does not. Describe the behavior and result briefly; do not paste commands, flags, counts, timings, or terminal output.
- Disclose a failing, skipped, or unstarted required check when it creates review or merge risk; state the missing behavioral evidence precisely rather than adding boilerplate such as "full test suite not run."
- Keep laptop troubleshooting and internal workflow status in the session unless they create material review or merge risk or the template requires them. This does not waive readiness gates or permit hiding genuine missing required validation.
- Do not invent a security section. If the repository template asks for security impact and there is none, answer only `None.` without justification or reassurance. If there is a material security impact, state it and any mitigation concisely.
- Mention risk, rollout, compatibility, or follow-up work only when relevant.
- Do not mention AI assistance or add AI-generated footers such as "Generated with ..." unless the user explicitly asks, even when earlier PRs in the repository have them.
- Do not include unrelated changes just to make the PR appear more complete.

If no template exists, use this minimal structure:

```markdown
## What

<why this is needed and what changed>
```

Add another section only when it contains relevant, non-routine information.

## Publish safely

1. Ensure the task changes are committed and the working tree state is understood. Reconcile the proposed description with current check and review evidence for this revision; do not copy stale caveats or success claims from an earlier handoff. Remove resolved blockers, retain genuine material gaps, and preserve the required draft/readiness status.
2. Push only the current non-default feature branch with a normal push. Never use `--force` or `--force-with-lease` unless the user separately and explicitly requests it and the harness's safety policy allows it.
3. Keep external mutations in separate commands. Do not chain a push, PR creation, comments, edits, or other GitHub mutations together.
4. Create exactly one PR with the selected head, base, title, body, and draft status. Use a temporary body file when it avoids quoting errors.
5. Create a draft PR only when requested, when the user explicitly establishes draft-first workflow, or when the `high-risk-completion` gate requires an unreviewed change to remain draft.
6. Do not add labels, reviewers, assignees, comments, or project metadata unless requested.
7. Verify the result with a read-only PR lookup and inspect local status. Verification is a follow-up check, not a second attempt to create or mutate the PR.

If GitHub is unavailable or verification fails, preserve the local state, avoid repeated mutation attempts, and report what succeeded, what remains uncertain, and the exact safe next step.

Publication may be delegated to a subagent only when the harness defines a bounded publication policy for subagents. Follow that policy; without one, publish from the interactive session.

## Final response

Report concisely:

- PR title and URL, or the local description path if publication was not authorized
- base and head branches
- draft or ready status
- commits or files included at a high level
- checks run and their results
- independent-review status for a high-risk change, including the reviewed revision when applicable
- any remaining local changes, failures, or follow-up actions
