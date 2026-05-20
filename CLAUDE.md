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

See `docs/architecture.md` for the full developer-facing architecture reference.

## Current state (as of 2026-05-20)

`master` is the active branch. `feat/personal-dev-box` has been merged and deleted.

- Manifest: `~/.config/komora/box.yaml` (single source of truth)
- Backend: `msb` CLI for all persistent ops (create/start/stop/remove); SDK used only for short structured calls
- Tiered secrets: workload via `secretEnv`, identity via `SSH_AUTH_SOCK` forwarding
- Tests: 104 unit tests + 5 e2e tests passing

## Workflow rules

- Do not commit `HANDOFF.md`; keep local-only.
- Do not commit `docs/superpowers/` files.
- Verify claims against code before stating as facts.
- Prefer minimal changes.
- If git push fails, stop and report.

## Doc locations

- Architecture: `docs/architecture.md`
- Quickstart: `docs/quickstart.md`
- Manifest reference: `docs/box-yaml-reference.md`
- Secrets model: `docs/secrets.md`
- Troubleshooting: `docs/troubleshooting.md`
- Design specs: `docs/design/YYYY-MM-DD-<topic>-design.md`
- Implementation plans: `docs/implementation/YYYY-MM-DD-<topic>-plan.md`

## Background: why microsandbox

**Repo:** https://github.com/superradcompany/microsandbox
**Docs:** https://docs.microsandbox.dev (check repo README if that URL changes)
**LLMs version:** https://docs.microsandbox.dev/llms.txt

microsandbox provides:
- Persistent named microVMs (firecracker-based, fast boot)
- Disk snapshots (`msb snapshot create/restore`) — komora's `bake` uses these for the base image
- TLS-intercepted egress with per-domain allow/deny and `secretEnv` placeholder injection — the foundation of komora's workload secrets model
- Named persistent volumes (`-v name:mountpoint`) that survive VM recreation
- Port forwarding, resource caps (memory, CPU, disk), `msb exec` for running commands inside a VM

The key tradeoff that shaped komora's design: the TypeScript SDK wraps a NAPI native binary, and that binary has GC-visible destructors. For persistent VMs, this means the SDK must NOT be used for create/start/stop — see Lessons Learned below.

**Why not Docker/Podman?** Docker-in-container doesn't give real isolation or snapshot semantics. microsandbox gives actual VM isolation (separate kernel, separate network stack) with the ergonomics of containers.

**Why not a full VM (QEMU/VMware)?** Boot times are too slow and lifecycle management is complex. microsandbox boots in ~300ms and has a simple CLI.

## Lessons Learned (critical gotchas)

These burned multiple hours during development. Do not relearn them.

### 1. Never use SDK for persistent sandbox creation or start

`Sandbox.builder().createDetached()` and `Sandbox.start()` from `@microsandbox/sdk` return NAPI handles with C++ destructors. When the Node.js process exits (or the handle is GC'd), the destructor stops the sandbox — typically ~7–9 seconds after the CLI process returns. The sandbox shows as `running` briefly, then silently goes `stopped`.

**Fix:** Use `msb create` and `msb start` CLI via `runMsb()` in `src/box/backend/msb.ts`. The CLI spawns a detached background process with no GC side-effects.

**Relevant:** `src/box/backend/sdk.ts` (`buildSandbox`), `src/box/backend/lifecycle.ts` (`upCmd`)

### 2. `msb exec` with `stdio: 'pipe'` hangs forever

When Node's `spawn()` creates a child process with `stdio: 'pipe'`, `msb exec` blocks waiting for stdin to close. There's no EOF, so it hangs indefinitely.

**Fix:** Use `stdio: ['ignore', 'pipe', 'pipe']` for non-interactive exec. `'ignore'` wires stdin to `/dev/null`.

**Relevant:** `src/commands/attach.ts`

### 3. Never override `HOME` in test environments

`msb` CLI finds its global database at `~/.microsandbox/db/msb.db`, using `HOME`. If `HOME` is redirected to a temp dir (e.g., for test isolation), `msb` can't find its db and returns "sandbox not found" or hangs silently.

**Fix:** komora uses `XDG_CONFIG_HOME` and `XDG_STATE_HOME` for its own config isolation in tests. `HOME` must point to the real home directory.

**Relevant:** `tests/integration/helpers.ts` (`withTmpHome`)

### 4. Workload secret env vars inside the box are placeholders

Inside the VM, `ANTHROPIC_API_KEY` is set to `$MSB_ANTHROPIC_API_KEY`, not the real value. The real value is injected by microsandbox's TLS proxy only for outbound requests to the declared domain. `printenv` will always show the placeholder — this is correct behavior, not a bug.

**Relevant:** `src/secrets/inject.ts`, `docs/secrets.md`

### 5. `msb remove` requires the sandbox to be stopped first

`msb remove` (and the SDK's `Sandbox.remove()`) fails with "sandbox still running" if called on a running sandbox. Always `msb stop` first, with a brief sleep if needed (daemon race).

**Relevant:** `src/box/backend/lifecycle.ts` (`destroyCmd`)

### 6. `msb snapshot create` requires `--force` to overwrite

Without `--force`, `msb snapshot create` fails if a snapshot with that name already exists. komora's `image.ts` already passes `--force` in `bakeCmd`.

**Relevant:** `src/box/backend/image.ts`

## Known followups

- `komora profile list/delete` commands (not yet implemented)
- `komora ssh` e2e test — skipped; `sshCmd` uses `stdio: 'inherit'` with no cmd passthrough (same fix as `attachCmd`: add `['ignore','pipe','pipe']` + optional `cmd[]` param)
- V3: host-side credential proxy, OS keychain integration, image pinning
- pause/resume: wired up but not implemented in microsandbox yet
