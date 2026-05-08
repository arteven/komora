# CLAUDE.md

## Project

`komora` is a TypeScript CLI that runs AI coding agents (claude, opencode, gemini, etc.) in isolated microsandbox microVMs. One sandbox per workspace per agent.

**Branch model:** `master` is stable. Feature work on branches. Preserve `archive/komora-research`.

## Architecture

- `src/agents/` — one file per agent; each exports `AgentDefinition` (template, volumes, secrets, domains)
- `src/config/` — types, schema (AJV), YAML load, resolve pipeline, index entry point
- `src/sandbox/` — microsandbox SDK lifecycle, naming, locking
- `src/commands/` — run, create, start, stop, rm, ls, exec, logs, secrets
- `src/toolchains/` — shell scripts installed at sandbox creation (node, bun, python, go, rust, dotnet)

See `docs/architecture.md` for full design reference.

## Current state (as of 2026-05-09)

All v2 features implemented on `feat/v2-implementation`:
- Agent registry with 5 built-in agents (claude, opencode, gemini, copilot, codex) + shell
- `komora.config.yaml` support (toolchain, setup, env, mounts, secrets, network, raw, profile)
- Credential profiles: `--profile <name>` isolates auth volumes + sandbox names
- Volume naming: `*-home` (e.g., `claude-home`, `claude-dotfile` for onboarding state)
- Profile validation: lowercase alphanumeric with hyphens

**Breaking volume rename:** existing `claude-auth` → `claude-home` (manual rename needed on existing installs).

## Workflow rules

- Do not commit `HANDOFF.md`; keep local-only.
- Do not commit `docs/superpowers/` files.
- Verify claims against code before stating as facts.
- Prefer minimal changes.
- If git push fails, stop and report.

## Known followups

- `komora profile list/delete` commands (not yet implemented)
- V3: host-side credential proxy, OS keychain, image pinning
