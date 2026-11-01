---
name: upgrade-pi
description: Upgrade Pi itself, refresh model catalogs, update installed Pi packages and local npm dependencies, fix extension compatibility, validate, and commit the upgrade including lastChangelogVersion. Use when asked to update or upgrade Pi or run Pi maintenance.
---

# Upgrade Pi

Upgrade the installed Pi and this repository's Pi configuration together. A request to run this workflow includes dependency installation and a local upgrade commit unless the user says otherwise. A request to discuss or edit the skill does not authorize running it. Never push.

## Scope and preflight

1. Find the bots checkout through `BOTS_DIR` or the real path of this skill. Read its `AGENTS.md` and `pi/AGENTS.md`. Run repository commands there, not in the project from which the user invoked the skill.
2. Load the `commit` and `test-quality` skills. Inventory staged, unstaged, and untracked changes before doing anything. Preserve unrelated work; do not stash, reset, switch branches, or pull automatically. Follow the repository's main-branch workflow; ask if the checkout is on another branch.
3. Inspect `pi/package.json`, its lockfile and workspace policy, `pi/settings.json`, configured packages (`pi list`), and extension test entry points. Record the installed Pi version, executable location, Node/pnpm versions, and local Pi dependency versions. Use the repository's declared toolchain.
4. Read the installed Pi documentation and `pi update --help`; update commands have changed across releases. Read release notes between the installed and proposed stable version, especially extension APIs, providers, models, and settings migrations. Do not opt into prereleases unless requested.
5. Run `pnpm --dir pi check` as a baseline. Diagnose failures before upgrading; distinguish existing failures from regressions.

This covers personal Pi packages and this checkout's authored extensions, not arbitrary project packages or other tools. Keep model defaults and `enabledModels` unchanged unless the user approves replacements. Do not edit guardrail settings or sources, weaken package-manager security/build policies, or bypass checks. If compatibility requires a protected change, stop and report it.

`bin/bots upgrade` pulls the repo, installs the existing lockfile, and relinks every tool. It does not upgrade Pi or dependency versions, so it is not a substitute for this workflow.

## Upgrade the runtime and catalogs

Use the installed version's supported commands. On versions with the current update interface, run each separately from the bots checkout and inspect its result:

```bash
pi update
pi --version
pi update --models
pi update --extensions
```

Confirm the executable now runs the expected version; do not mistake the current agent process for the upgraded runtime. If self-update is unsupported, discover how Pi was installed and use that installer's documented upgrade path rather than installing a second copy.

Check package scope before updating: do not update project-local declarations outside this task. Respect npm version pins and git refs; report packages kept pinned rather than silently unpinning them. Local-path extensions are not upgraded by the package updater. Read updated package release notes and resolve only upgrade-related compatibility problems.

Refresh model catalogs explicitly; do not assume `--all` includes them. Inspect `pi --list-models` afterward and check the configured default and model-cycle entries. Report missing models or authentication separately; refreshing metadata does not prove inference works. Never dump credentials, commit generated catalogs, or replace model preferences merely because newer models exist.

## Upgrade local dependencies and extensions

1. Inspect outdated dependencies with `pnpm --dir pi outdated`. Use pnpm, not npm install, for this workspace so its lockfile stays authoritative.
2. Align the direct `@earendil-works/pi-*` packages with the verified installed runtime release. Confirm those versions exist and preserve exact pins. Use `pnpm --dir pi add --save-exact` with explicit `package@version` arguments; do not hardcode a version in this skill.
3. Update the remaining runtime and development dependencies to current stable releases using `pnpm --dir pi update --latest` with explicit non-Pi package names. Preserve dependency/devDependency placement. Inspect major-version release notes and engine requirements; stop for a decision if the update needs a broader toolchain migration.
4. Inspect manifest and lockfile diffs, peer warnings, and install/build failures. Keep existing release-age and lifecycle-script policies intact; if they block a release, report it rather than adding exceptions. Do not use force flags or blanket audit fixes.
5. Fix compatibility in authored, unprotected extensions only. Read the new version's extension docs and relevant examples before adapting APIs. Add regression coverage only for changed application behavior. Avoid unrelated refactors and whole-tree formatting, especially commands that could rewrite protected sources.

If a candidate cannot be made compatible within this scope, stop before the upgrade commit and explain the installed/runtime and working-tree state. Ask whether to defer that dependency or pursue a separate migration; do not silently declare a partial upgrade complete.

## Validate and record the release

Run:

```bash
pnpm --dir pi install --frozen-lockfile
pnpm --dir pi check
```

Inspect full results, including skips. Exercise changed extension behavior through existing tests or a focused smoke check. A successful typecheck alone does not establish that extensions load in the installed runtime.

Start a fresh Pi process with the normal personal configuration and inspect startup/resource diagnostics without disabling extensions or guardrails. Prefer a no-prompt startup check that does not send model requests. If the harness cannot inspect interactive startup, ask the user to restart Pi and report startup errors; label that check pending rather than claiming it passed. `/reload` can refresh resources but does not replace the running Pi executable. Do not initiate Slack/Notion actions or paid inference just to smoke-test an upgrade.

Read the installed release's changelog, then ensure `pi/settings.json` has `lastChangelogVersion` equal to the verified installed version. Pi may write it on interactive startup; otherwise make a targeted edit to that key only. Include an already-dirty `lastChangelogVersion` hunk when it matches this upgrade, but preserve all other pre-existing settings changes. Do not rewrite the JSON wholesale or touch the guardrails object.

## Commit and report

1. Re-inventory the entire diff after installs and checks. Include the manifest and lockfile, required compatibility fixes and tests, and the `lastChangelogVersion` hunk. Exclude credentials, sessions, generated catalogs, installed packages, node_modules, and unrelated pre-existing work.
2. Follow the `commit` skill to stage only upgrade-owned paths or hunks. Commit only after required checks pass; if startup remains pending or checks are blocked, report the gap and ask before committing an unverified upgrade. Use a concise subject such as `pi: upgrade to <version>`. Do not create an empty commit if nothing tracked changed.
3. Report the old/new Pi versions, package or dependency exceptions, model refresh result, checks actually completed, commit hash, remaining changes, and whether a restart is still required. State that no push occurred. Distinguish changes to the installed runtime from changes captured in Git.
