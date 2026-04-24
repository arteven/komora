# Handoff: Komora V1 Design

## Goal

Design and implement `komora` — a thin TypeScript wrapper around `microsandbox` for personal agent sandboxes.

## Current State

- Repo restarted on `master` branch (3 commits in)
- Earlier research preserved on `archive/komora-research` branch
- A design spec exists at `docs/superpowers/specs/2026-04-24-komora-v1-design.md`
- No implementation code exists yet — only docs and the `microsandbox` submodule under `vendor/`
- There is one untracked directory: `docs/`

## What Was Done

- Repo was restarted with a clean `master` branch
- `vendor/microsandbox` was added as a git submodule
- A detailed V1 design spec was written covering:
  - Core model: `workspace + agent + profile + local secrets + CLI flags`
  - Agent flavors: `claude`, `opencode`
  - Environment profiles: `nodejs`, `kotlin-android`, etc.
  - Config entrypoint: `komora.config.ts`
  - Thin wrapper philosophy — stay close to native `microsandbox`

## Next Steps

- Read the full design spec (`docs/superpowers/specs/2026-04-24-komora-v1-design.md`) — it is 341 lines and not yet fully read
- Decide on project scaffolding: `package.json`, TypeScript config, entry CLI
- Begin implementing the core config resolution logic
- The `docs/` directory is untracked — consider whether to commit it

## Key Files

- `CLAUDE.md` — repo rules and workflow notes
- `docs/superpowers/specs/2026-04-24-komora-v1-design.md` — V1 design spec (341 lines)
- `vendor/microsandbox` — submodule with the upstream SDK
- `README.md` — project overview

## Constraints

- Keep `master` clean and focused
- Prefer small, practical iterations
- Do not commit `HANDOFF.md`
- If git push fails due to auth/remote issues, stop and report
