# CLAUDE.md

## Project

`komora` is a TypeScript CLI that builds and manages a single persistent personal dev microVM ("the box") via microsandbox. Replaces the prior per-workspace ephemeral sandbox model.

**Branch model:** `master` is stable. Feature work on branches. Preserve `archive/komora-research`.

## Architecture

- `src/box/` — manifest types, schema, loader, resolver
- `src/box/backend/` — msb/SDK wrappers, lifecycle, image bake, rebuild, ssh probe, status
- `src/baker/` — base image recipe + install fragments
- `src/secrets/` — file-backed keychain, tiered classification, workload injection
- `src/commands/` — bake, rebuild, up, down, pause, resume, destroy, ssh, attach, status, logs, secret
- `src/util/` — paths, log

See `docs/design/2026-05-19-personal-dev-box-design.md` for the full design.

## Current state (as of 2026-05-20)

Branch `feat/personal-dev-box`: complete rewrite around the personal-dev-box model.
- Manifest: `~/.config/komora/box.yaml` (single source of truth)
- Backend: microsandbox SDK + `msb` CLI (snapshot, exec, logs)
- Tiered secrets: workload via `secretEnv`, identity via `SSH_AUTH_SOCK` forwarding

## Workflow rules

- Do not commit `HANDOFF.md`; keep local-only.
- Do not commit `docs/superpowers/` files.
- Verify claims against code before stating as facts.
- Prefer minimal changes.
- If git push fails, stop and report.

## Doc locations

- Design specs: `docs/design/YYYY-MM-DD-<topic>-design.md`
- Implementation plans: `docs/implementation/YYYY-MM-DD-<topic>-plan.md`

## Known followups

- `komora profile list/delete` commands (not yet implemented)
- V3: host-side credential proxy, OS keychain, image pinning
