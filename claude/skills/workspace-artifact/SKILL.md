---
name: workspace-artifact
description: Create or update a Forest workspace's tracker page, a published Artifact rendered from its CONTEXT.md. Use only when the user invokes /workspace-artifact.
argument-hint: "[workspace name]"
disable-model-invocation: true
---

# Workspace artifact

Render a Forest workspace's `CONTEXT.md` as a private tracker page: create it the first time, update it in place after that. `CONTEXT.md` stays the handoff; the page is a view of it and never the other way round.

## Resolve the workspace

1. Use the workspace named in $ARGUMENTS, or the unambiguous workspace containing the current working directory. Resolve it with `git forest list` and `git forest status`. Stop if it is ambiguous.
2. Read its `CONTEXT.md`. Stop if it doesn't exist and suggest `/workspace` or `/checkpoint`.
3. Look in its `## Artifacts` section for a `Tracker page` line holding a claude.ai artifact URL.

## Source rules

- Everything about state comes from `CONTEXT.md` alone: status, priorities, plan, next actions, dates, owners, blockers, and what is or isn't verified. Where the current page disagrees, `CONTEXT.md` wins.
- On an update, you may carry over reference material from the current page that `CONTEXT.md` doesn't contradict, such as source links for decisions and link lists. Drop anything whose state you can't trace to `CONTEXT.md`.
- Don't research Slack, GitHub, Notion or live systems. If `CONTEXT.md` looks stale, say so and suggest `/checkpoint` before republishing; don't fix it here.
- Keep hypotheses and unverified claims marked as such. Never include credentials, secret values or secret-bearing output.
- Write in neutral third person ("hirad", not "you"), so the page can be shared without rewording.

## Page

Show near the top, not in a footer: the `CONTEXT.md` "Last updated" value the page was built from.

Include the sections `CONTEXT.md` supports, in this order, skipping empty ones:

1. Header: objective in a line, DRI, due date, status.
2. Current plan: the plan or priority `CONTEXT.md` states for now, in its order, with any dated deadlines.
3. Next actions.
4. Work by phase or stream, each item with a status and its PR or issue links.
5. Decisions, with who made them and their sources.
6. Open questions, with who can answer.
7. Not verified.
8. Links.

Keep the data in one block in the page's script so later updates replace data, not markup. On an update, keep the existing layout, styling and section ids unless the content no longer fits them.

## Publish

- **Create:** follow the Artifact tool's design guidance, publish privately, then add `- Tracker page (private): <url>` to the `## Artifacts` section of `CONTEXT.md`. That line is the only edit this skill makes to `CONTEXT.md`.
- **Update:** read the current page with the Artifact tool first, build on the returned version, and republish to the same URL. If the publish conflicts, merge onto the newer version rather than forcing.
- Don't change sharing, pin the page, or post the link anywhere.

## Report

Give the URL, the `CONTEXT.md` timestamp it was built from, and at most three lines on what changed since the previous version.
