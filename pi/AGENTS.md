# AGENTS.md

## What this directory is

Personal configuration for the Pi coding agent. This directory contains the authored files that `bots link pi` Stows into `~/.pi/agent`. Runtime files such as authentication, sessions, trust state, installed packages, and generated model data remain untracked in `~/.pi/agent`.

There is no application build. Extensions are TypeScript and use the local pnpm/Oxc/TypeScript toolchain.

## Common commands

Run these from `pi/`:

```bash
pnpm install  # Install extension development dependencies
pnpm check    # Check formatting, linting, types, and extension tests
pnpm format   # Format tracked extensions with Oxfmt
```

## Layout

- `settings.json` and `keybindings.json` are the portable Pi configuration.
- `extensions/` contains authored extensions and their tests.
- `skills/` contains Pi-only skills. Shared skills live in the repository root's `skills/` and reach Pi through `~/.agents/skills`; Pi's global instructions (`APPEND_SYSTEM.md`) are the root `instructions.md`.
- `package.json`, `pnpm-lock.yaml`, and the Oxc/TypeScript files support extension development.
- `.stow-local-ignore` keeps repository-only files out of `~/.pi/agent`. `node_modules` and `package.json` must stay Stowed because the non-Pi dependencies (`@modelcontextprotocol/sdk`, `@napi-rs/keyring`, `diff`, `typebox`, `zod`) resolve through the linked `node_modules`.

`pi/.gitignore` pins authored files. New skills, agents, and prompts must be allowlisted in `.gitignore` before `git status` will show them, and `git status --ignored` reveals what is hidden. `extensions/herdr-agent-state.ts` is installed and overwritten by herdr, so it remains ignored. Do not commit authentication, sessions, trust state, `node_modules`, Pi-installed packages, generated model data, or other runtime files.

Pi writes `settings.json` in place, so the Stow symlink survives upgrades. Pi upgrades may change `lastChangelogVersion`; commit or discard that one-line churn as appropriate.
