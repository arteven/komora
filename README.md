# komora

A thin wrapper around the `openshell` CLI. See [CONTEXT.md](CONTEXT.md) and
[#14](https://github.com/arteven/komora/issues/14) for the architecture.

## Development

The entry point is `bin/komora`, a bash script. `--dry-run` prints the
`podman` / `openshell` invocations it would run instead of running them —
this is the seam the test suite asserts against.

```sh
./bin/komora --dry-run ls
```

**Tests**: [bats](https://github.com/bats-core/bats-core), run with:

```sh
bats tests/
```

**Pre-commit check**: `shellcheck` must pass clean on every script before
committing:

```sh
shellcheck bin/komora
```

## Verification log

Manual, non-bats verifications for prerequisite tickets that are "verifiable,
not demoable" (#14). Recorded here rather than left implicit, following #6's
evidence-base precedent.

### #17 — volume creation and priming

Run against `ghcr.io/nvidia/openshell-community/sandboxes/base:latest`,
Podman 6.0.1, on the developer's machine.

| Check | Result |
| --- | --- |
| uid resolution | `getent passwd sandbox` via `--entrypoint sh` returns `998`, matching the spec's stated value; no numeric literal in the script |
| unprimed volume ownership | first-mount auto-chown targets container root (`root:root`), confirming the failure mode the spec describes |
| priming writes as the sandbox uid | `podman run --user 998:998 --entrypoint sh -v <vol>:/x <image> -c 'touch /x/.keep'` succeeds; volume ownership becomes `sandbox:sandbox` |
| post-priming writability | a second `--user 998:998` run creates an unrelated file in the same volume without error |
| idempotency | `podman volume create` on an existing name errors (exit 125) — `ensure_volume`'s existence check is load-bearing, not defensive polish; re-running `komora volumes` end-to-end neither errors nor disturbs the existing `.keep` |

### #18 — one command lands you in an authenticated agent session

Run against real `openshell` (v0.0.93) and Podman 6.0.1 on the developer's
machine, targeting `arteven/komora`. Every sandbox and volume created during
this test was deleted afterward; nothing was left live.

| Check | Result |
| --- | --- |
| create path | `komora run arteven/komora` with no existing sandbox creates one, clones the repo inside via HTTPS, and hands off to `claude` |
| authenticated session | `claude --print "say the word: banana"` inside the sandbox returns `banana`; the agent CLI is authenticated end-to-end |
| credential isolation | host `~/.claude/.credentials.json` (via `CLAUDE_CONFIG_DIR`) verified byte-identical (`md5sum`) before and after — staged by copy, never mounted, never written back to |
| resume path | a second `komora run arteven/komora` against the same repo skips creation, reports "resuming sandbox", and reattaches via `openshell sandbox exec` into the same repo/session — no re-clone |
| resume restages the credential | a follow-up fix after code review: the resume branch now restages the credential before reattaching, not just on create; re-ran resume against the live sandbox and confirmed the restage podman call completes without error and the host credential stays byte-identical (`md5sum`) afterward |
| cleanup | sandbox and both volumes (`komora-repo-arteven-komora`, `komora-profile-default`) deleted after each verification pass; confirmed absent from `openshell sandbox list` / `podman volume ls --filter label=komora` |

Four bugs surfaced only by real infrastructure, invisible to `--dry-run` and
to unit tests built on fakes:

| Bug | Symptom | Fix |
| --- | --- | --- |
| credential copy permission | `cp` inside the staging container failed with `Permission denied` — the host credential is `0600`, owned by the host uid, unreadable by the sandbox uid through the rootless userns mapping | copy as `--user 0:0` (maps to the host's own uid, which owns the file), then `chown`/`chmod` the copy to the sandbox uid inside the same invocation |
| sandbox name length | `openshell sandbox create` rejected `komora-arteven-komora` (21 chars): OpenShell caps routable names at 19 (`MAX_ROUTABLE_NAME_LEN`) | `sandbox_name()` hashes the slug instead of concatenating it (`komora-<10 hex chars>`, 17 chars), with the readable slug preserved as a `komora.slug` label |
| label value charset | `openshell sandbox create --label komora.repo=arteven/komora` rejected `/` as an invalid label character | dropped the repo-id label from the *OpenShell* sandbox (kept only the already-safe `komora.slug`); the full repo id is still recorded on the *Podman volume* label, which has no such restriction |
| repo_id vs. slug on the volume label | second `komora run` for a real repo reported a false "slug collision" against its own volume | `ensure_repo_and_profile_volumes` was storing the slug on `komora.repo`, but collision detection compares against the full repo id; fixed to store the repo id, covered by a regression test asserting `komora.repo=<repo_id>` appears in the create-path dry-run trace |

Code review (Standards and Spec axes, run separately) found the standalone
`komora volumes <slug>` command — #16/#17 plumbing since superseded by
`cmd_run` — had no real repo id to label with and silently reintroduced the
row above; it's removed, and its coverage folded into `cmd_run`'s dry-run
tests. Two further gaps surfaced by the same review were out of #18's
acceptance criteria as written and are tracked separately rather than
blocking this ticket: no git identity synthesis on chamber start per
ADR-0003 ([#27](https://github.com/arteven/komora/issues/27)), and a
concurrent-attach race where two simultaneous `komora run` calls on one
repo can both resume into the same live work tree
([#28](https://github.com/arteven/komora/issues/28)).
