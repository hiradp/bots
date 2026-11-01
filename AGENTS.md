# AGENTS.md

This file provides guidance to coding agents working in this repository.

## What this repo is

Configuration for the coding agents I run: Pi, Claude Code, and Codex, plus the skills they share. It replaced the archived `hiradp/pi-config` repo and the agent configs that used to live in the `home` dotfiles repo; `bin/bots link` removes links left by those old locations.

## Common commands

```bash
bin/bots setup            # Install Pi dependencies, then link every tool
bin/bots link [tools...]  # Stow tool configs into place (default: all)
bin/bots upgrade          # git pull --ff-only, install Pi dependencies, re-link
bin/bots report           # Quota and API-equivalent spend across Pi, Claude, and Codex
```

The `home` CLI (`$HOME_DIR`, default `~/Code/hiradp/home`) clones this repo to `$BOTS_DIR` and chains to it: `home setup` runs `bots setup`, `home link` runs `bots link`, and `home upgrade` runs `bots upgrade`. `bin/bots` sources `$HOME_DIR/lib/log.sh`, so use its `log_*` helpers rather than raw `echo`, and start every bash file with `set -euo pipefail`.

The work repo's `bin/work` links work-only Pi prompts into `pi/prompts/`; those links are ignored here and recreated by `work install` and `work upgrade`.

## Layout

Each top-level tool directory is a Stow package for that tool's config directory:

- `pi/` → `~/.pi/agent`. See `pi/AGENTS.md` for Pi extension development.
- `claude/` → `~/.claude`: `settings.json`, `statusline.sh`, and Claude-only `agents/` and `skills/`. `/review-code` runs its Opus and Sonnet passes as the `code-reviewer` agent and its GPT-6 Astra passes through `codex exec`. The second identity in `~/.claude-ps` (reached through home's `claude-ps` fish wrapper, which leaves the default's `CLAUDE_CONFIG_DIR` unset) gets per-file links to the same `settings.json`, agents, instructions, and skills, so only login, sessions, and history differ. The statusline tells the identities apart through `$CLAUDE_CONFIG_DIR`. `settings.json` is not Stowed: Claude Code reads and rewrites one settings file, so `bots link claude` merges the tracked file with the work repo's `$WORK_DIR/.agents/claude-settings.json` when that exists (objects key by key, lists concatenated) into the ignored `.generated/claude-settings.json`, which both config dirs link. Claude writes its own changes there; the next `bots link` stops and shows them until they are ported into a source or the generated file is deleted. User-scoped MCP servers live in `.claude.json` with Claude's runtime state, so `claude/mcp.json` is not Stowed either: `bots link claude` merges its servers into both identities' `.claude.json` (tracked servers win) and warns about servers added with `claude mcp add` that aren't tracked yet.
- `codex/` → `~/.codex`: `hooks.json` and `config.managed.toml` are Stowed. Codex writes machine-local paths and generated state (project trust, plugins, desktop, marketplace, hook trust) into `~/.codex/config.toml`, so that file is never linked or committed; `bots link codex` merges `config.managed.toml` over it with `yq`, and tracked keys win. Put portable Codex defaults in `config.managed.toml`.
`lib/report.ts` backs `bots report`. It reads Pi sessions through Pi's `/usage` aggregator (`pi/extensions/usage`), prices Claude Code (`~/.claude` only) and Codex transcripts from Pi's model catalog plus a small override table, and fetches live quota with each CLI's stored OAuth token. Runs that don't persist their own session (Pi subagents and historical runs of Pi's removed `claude` tool) count under the harness that started them.

## Shared instructions and skills

`instructions.md` is the global instructions file for every agent. `bin/bots` links it as Pi's `~/.pi/agent/APPEND_SYSTEM.md`, Claude's `CLAUDE.md` in both config dirs, and Codex's `~/.codex/AGENTS.md`. Keep it harness-neutral.

When the work repo has `$WORK_DIR/.agents/instructions.md`, `bin/bots` appends it to `instructions.md` in the ignored `.generated/instructions.md` and links that file instead, so work-only rules stay out of this repo. Run `bots link` after editing either file.

`spinner-verbs.json` holds the working phrases shown while an agent runs. `bin/bots` links it as Pi's `~/.pi/agent/spinner-verbs.json` and copies it into `spinnerVerbs` in `claude/settings.json`, whose schema accepts only an inline list; edit the phrases in `spinner-verbs.json`, then run `bots link claude`.

`skills/` holds skills shared by every agent. `bin/bots` links each one, plus each skill in the work repo's `$WORK_DIR/.agents/skills` when that exists, into `~/.agents/skills` (read by Pi and Codex) and into `skills/` in both Claude config dirs (Claude does not read `~/.agents/skills`). Links to removed skills are pruned on the next `bots link`. Skills used by only one agent live in that tool's directory instead, such as Pi's `pi/skills/` or Claude's `claude/skills/`, which Stow links as usual.

Shared skills must stay harness-neutral: describe capabilities ("read the Slack thread", "the harness's safety policy", "subagents") rather than one tool's extensions, commands, tool names, or agent names, and keep tool-specific policy in that tool's own skills.

To add a tool, create its directory as a Stow package, then add it to `DEFAULT_TOOLS`, the `cmd_link` switch, and the help text in `bin/bots`.

## Git workflow

Work directly on `main`; do not create a feature branch or pull request unless explicitly requested. When the user asks for a commit, commit the completed change to `main`.

Prefix commit subjects with the tool they touch (`pi: add usage view`, `claude: share skills`); use no prefix for repo-wide changes. Otherwise follow the commit skill's message rules, and keep commits tight and single-purpose.
