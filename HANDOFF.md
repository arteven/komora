# Handoff: Komora V1 — IMPLEMENTATION COMPLETE

**Generated**: 2026-04-30 (after Phases 9 + 10)
**Branch**: `feat/komora-v1` (**34 commits** ahead of `master`)
**Status**: **All V1 phases complete (1–10).** 117 tests passing + 1 e2e skipped (gated on `KOMORA_E2E=1`). Typecheck clean. Clean build verified. Version bumped to `0.1.0`. Ready for finishing-a-development-branch (merge / PR / cleanup).

## Goal

V1 implementation is done. Next step is integration:
- Use `superpowers:finishing-a-development-branch` to choose merge / PR / cleanup.
- Optional follow-ups (post-V1 list below).

## Completed in This Session (Phase 9 + Phase 10)

### Phase 9 — End-to-End

- [x] `597a23f` **9.1** `tests/integration/run.e2e.test.ts` — verbatim from plan, gated on `KOMORA_E2E=1`. Default `npm test` runs 117 passed + 1 skipped.
  - **Plan defect recorded:** the e2e test as written has no `testTimeout` override; vitest's 5s default cannot accommodate a real microsandbox VM boot + image pull + exec. Per controller rules ("do not weaken assertions") it landed verbatim. Real fix is post-V1: add `testTimeout: 180_000` (or per-test third-arg timeout) so a `KOMORA_E2E=1` run can actually pass on a provisioned host. Do NOT skip-fix this without the user's say-so.

### Phase 10 — README & Release

- [x] `14ad6c2` **10.1** `README.md` rewritten verbatim from plan (Quick start, IntelliSense header, command table, link to design spec).
- [x] `038caa5` **10.2** Clean build verified (rm -rf dist node_modules → install → typecheck → test → build → `node dist/cli.js --version` printed `0.0.0`); then `package.json` version `0.0.0` → `0.1.0`. Commit message taken from plan line 3230: "chore: bump to 0.1.0 for v1".

### Carried-forward notes status

1. ~~🔴 Secrets opt-in not in `ResolvedConfig`.~~ **RESOLVED** (`6ead092`).
2. ~~🟡 Built-in profiles dir not in `dist/`.~~ **RESOLVED** (`9860fe1`).
3. **🟢 Cosmetic — `network`/`digest` linger on `merged.profile`.** Optional one-line strip, not blocking.

## Plan Defects Recorded This Session

(Add to a "Failed Approaches" follow-up if/when the plan ever gets edited.)

- **Task 9.1**: e2e test has no `testTimeout`. As written it cannot pass even on a fully provisioned host — vitest aborts after 5s before a VM boot + image pull complete. Test is committed verbatim per controller protocol; fix is post-V1.
- (Earlier) Task 7.7 stdin test was workable; implementer added an injectable `stream` parameter to `readStdin` for clean testability. Production default = `process.stdin`.
- (Earlier) Task 7.8 logs: plan code referenced a non-existent `notImplemented(...)` helper. Replaced with an inline `throw new Error(...)` in `_sdk.ts`.

## Carried-Forward Concerns from Code-Quality Reviews (non-blocking nits)

- `runAgent` (`src/sandbox/agent.ts`): stdin `data` listener not removed in exit-cleanup. Single-shot per process, so OK.
- `runAgent`: `env: process.env as Record<string, string>` cast.
- `removeSandbox` deliberately unlocked — comment-worthy.
- `lifecycle.test.ts` uses custom mock-reset; `vi.resetAllMocks()` would be simpler.
- 5 moderate npm vulnerabilities reported (transitive, pre-existing).

## Not Yet Done

- [ ] **Integration of `feat/komora-v1` into `master`** — open PR(s) and/or merge `--no-ff`. Use `superpowers:finishing-a-development-branch`.

### Post-V1 follow-ups (do NOT do as part of V1)

- **Task 9.1 testTimeout fix** so `KOMORA_E2E=1` runs can actually pass on a provisioned machine.
- `kotlin-android` built-in profile (Task 8.3 deferred).
- Real `sdk.logs` implementation backed by `msb logs` (V1 stub throws).
- `runAgent` reusability (cleanup symmetry) if it ever runs more than once per process.
- Consider stripping `network`/`digest` from `merged.profile` (cosmetic).

## Resume Instructions

V1 is complete. Next session:
1. Read this HANDOFF.md fully.
2. Verify state:
   - `git status` shows only `HANDOFF.md` modified.
   - `git log --oneline master..HEAD | wc -l` → **34**.
   - `npm test` → 117 passed + 1 skipped.
   - `npm run typecheck` → clean.
   - `npm run build` → clean; `dist/profiles/builtin/{nodejs,python}.yaml` present.
3. Use `superpowers:finishing-a-development-branch` to decide on PR / merge / cleanup.
   - Project rule: **`--no-ff`** during merge.

## Environment Notes

- `msb 0.4.2` installed at `~/.microsandbox/bin/msb` (libkrunfw at `~/.microsandbox/lib/`). PATH not set in shell rc.
- Host has `/dev/kvm` and CPU virt extensions.
- `microsandbox@^0.4.2` is **daemonless**; SDK runs in-process.
- `microsandbox` ships native N-API binary; `node-pty` ships native bindings.

## Key Decisions Carried Forward

| Decision | Rationale |
|---|---|
| `_sdk.ts` barrel isolates SDK shape | Tests mock cleanly. |
| `network:` block reserved (warn-and-ignore) | V2 can adopt without schema break. |
| No `commands.initFiles`, no kind-mixin/agent split, no OCI/git distribution in V1 | YAGNI. |
| `moduleResolution: "bundler"` + explicit `.js` import suffixes | Works at runtime. |
| `secretsAllow` on `ResolvedConfig` is the V1 secret-injection gate | Intersection in `lifecycle.collectSecretValues`. |
| `removeSandbox` deliberately unlocked | `msb.stop`/`msb.rm` idempotent. |
| `runAgent` is single-shot per process | OK for V1. |
| `sdk.logs` is a V1 stub | `msb logs` integration deferred post-V1. |
| `kotlin-android` built-in deferred post-V1 | ~10 GB image; per Task 8.3 skip clause. |
| `build` step copies YAMLs into `dist/` via `fs.cpSync` | tsc doesn't copy non-TS; runtime needs them next to `discovery.js`. |
| `readStdin` accepts injectable stream | Testability seam; default `process.stdin`. |
| Task 9.1 e2e test committed verbatim despite testTimeout defect | Controller rule: do not weaken assertions; defect logged for post-V1 fix. |

## Failed Approaches (Don't Repeat)

- `msb run --privileged …` — flag does NOT exist in 0.4.2.
- Plan-as-written test bugs in Tasks 3.3, 4.2, 5.2-step-1, 6.1, 6.2, 7.7, 7.8, **9.1** (see Plan Defects across HANDOFFs).
- Re-adding kit-compat / OCI / initFiles to V1 — YAGNI.
- `notImplemented(...)` helper from plan — does not exist; inline `throw` instead.

## Files to Know

| File | Why It Matters |
|---|---|
| `docs/superpowers/specs/2026-04-30-komora-v1-design.md` | Approved spec. |
| `docs/superpowers/plans/2026-04-30-komora-v1-implementation.md` | Plan; **fully executed**. |
| `docs/spike-dind-feasibility.md` | Phase 0 result + 8.3 deferral note. |
| `docs/spike-msb-sdk.md` | Phase 5.1 result; `msb server` claim stale (SDK daemonless). |
| `src/cli.ts` | All 10 commands wired. |
| `src/commands/*.ts` | Phase-7 command implementations. |
| `src/sandbox/_sdk.ts` | Only file importing `microsandbox`. `logs(name, onLine)` is a V1 stub. |
| `src/sandbox/msb.ts` | Stable adapter contract; exposes `execCommand`. |
| `src/sandbox/lock.ts` | `withSandboxLock(name, fn)`. |
| `src/sandbox/lifecycle.ts` | `ensureSandbox`/`stopSandbox`/`removeSandbox`; secret gating. |
| `src/sandbox/agent.ts` | `runAgent` PTY runner. |
| `src/config/types.ts` | `ResolvedConfig` includes `secretsAllow: string[]`. |
| `src/profiles/discovery.ts` | Layered discovery; built-in dir resolved relative to `discovery.js`. |
| `src/profiles/builtin/{nodejs,python}.yaml` | Built-ins shipped in V1. |
| `tests/integration/run.e2e.test.ts` | Phase 9 e2e smoke (testTimeout fix is post-V1). |
| `README.md` | V1 UX docs. |
| `package.json` | Version `0.1.0`; `build` copies YAMLs to `dist/profiles/builtin/`. |
| `CLAUDE.md` (project) | Master clean, do not commit HANDOFF.md. |
| `~/.claude/CLAUDE.md` (global) | Conventional Commits, `--no-ff`, delegate. |

## Warnings

- **Do not commit `HANDOFF.md`.** Project + global rule.
- **`network` reservation stays inert in V1.** Resolver tests enforce it.
- **Image pulls from inside DinD still don't work** (IPv6 DNS). Doesn't affect normal use.
- **HANDOFF.md is the only file that should be dirty** at session start. Investigate anything else.
- **Phase 9 e2e is gated on `KOMORA_E2E=1` AND will fail on the 5s default timeout** until the post-V1 testTimeout fix lands. Default `npm test` skips it cleanly.
- This is a **personal sandbox project**. YAGNI applies aggressively.
