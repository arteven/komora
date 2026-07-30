# INVESTIGATION — sandbox lifecycle failure modes

Not a prototype: a written record for [#21](https://github.com/arteven/komora/issues/21),
following the criteria-and-observed-results precedent of the walking skeleton
([#6](https://github.com/arteven/komora/issues/6),
`prototype/walking-skeleton/README.md`). No code changes came out of this —
its output is the table below, feeding directly into `ls`/`stop`/`rm` (#24).

Environment tested: `openshell 0.0.93`, `podman 6.0.1`, Linux 6.12,
`ghcr.io/nvidia/openshell-community/sandboxes/base:latest` (image digest
`65fa5d3d598a`, ~3.42 GB).

## Method

Ran `bin/komora run` and, to isolate specific points, raw `openshell sandbox
create` directly (`komora`'s own volume-creation happens entirely *before* it
ever calls `openshell sandbox create` — see Finding 1). Interrupted with
`kill -TERM` on the local CLI process at three points: during the image pull,
immediately after (provisioning, image already cached), and after the
container was confirmed `Ready` and running the in-sandbox `git clone`.
Inspected resulting state with `openshell sandbox list|get -o yaml|json` and
`podman ps -a` / `podman volume inspect`.

## Criteria and observed results

| Criterion | Observed result |
| --- | --- |
| 1. Interrupt during image pull, during provisioning, after container start — record state each time | See Findings 2–4 below; all three reproduced |
| 2. Can a partially-created sandbox leave primed volumes with no sandbox referencing them? | **No**, for the `komora` wrapper specifically: it creates and primes both volumes *before* calling `openshell sandbox create` (Finding 1), and priming (`podman run ... touch .keep`) is a synchronous local command — killing `komora` never leaves it mid-write. The volume-orphan risk sits entirely on the "does a sandbox now exist that isn't referenced anywhere" question, not on Podman-level partial writes. |
| 3. Can an interrupted create hold a sandbox name against reuse, and how to recover? | **Yes, confirmed twice.** Killing the local CLI within roughly the first second of `sandbox create` leaves a sandbox record permanently stuck in `Provisioning` — no container, no further progress, ever (waited 60s+; server does not retry or time it out). The name is held: a second `create` with the same `--name` fails `sandbox 'X' already exists`. Recovery: `openshell sandbox delete <name>` frees it — see Finding 5 for a message quirk on this path. |
| 4. What can komora observe to distinguish an orphan from a stopped-but-intact sandbox's volume? | **Nothing conclusive from Podman/OpenShell state alone.** See Finding 6 — this criterion is only partially resolved. |
| 5. Record findings as a table, naming versions tested | This document |
| 6. State plainly what's confirmed vs. unexplained | See "Confirmed" / "Unresolved" below |

## Findings

**1. `komora`'s volumes exist before OpenShell ever sees the request.**
`ensure_repo_and_profile_volumes` (`bin/komora:112`) runs to completion —
create, prime, stage credential — before `launch_into` calls `openshell
sandbox create`. Confirmed via `--dry-run`: both `podman volume create` lines
print before the `openshell sandbox create` line. This means "interrupt
during image pull" and "interrupt during provisioning" cannot, by
construction, land komora's own volume-creation mid-write; those two
interrupt points only exercise OpenShell's own state machine.

**2. Interrupting `openshell sandbox create` during the image pull is
indistinguishable, in outcome, from interrupting it during provisioning.**
Forced a re-pull by removing the cached image (`podman rmi`), started
`sandbox create`, and killed the CLI while `Copying blob sha256:...` lines
were still streaming. Result: sandbox record left in `Provisioning`
permanently, no container, no partial image layers retained. Repeating with
the image already cached and killing at ~1s (before any container exists)
produced the identical stuck-`Provisioning`, no-container state. The
boundary is not "pull vs. provisioning" — it is a single narrow window
(observed ~1–2s with a cached image) before the gateway commits to creating
the container.

**3. Past that window, the sandbox becomes independent of the local CLI —
killing the CLI does not stop it.** At ~2s+ with a cached image, killing
`openshell sandbox create` left the sandbox at `Ready` with a live,
running container within a second of the kill — the server-side creation
had already passed the point of no return and completed on its own.
Repeated the same test through the full `komora run` wrapper, killing after
the in-sandbox `git clone` had visibly started (progress lines on the
terminal): the sandbox stayed `Ready`, the container kept running, and
`sandbox exec` moments later showed the clone had **completed successfully**
(`git status` clean, `HEAD` up to date) and `claude` was running as a
background process inside — all after the local process that supposedly
"ran" the create had been killed. This is the walking-skeleton bug's
mechanism, precisely explained: an interrupted run *looks* interrupted from
the terminal, but OpenShell's actual create/exec is server-driven and
detaching the client does not cancel it. `komora run` on the same repo
afterward correctly resumed this "orphaned" (from the user's perspective)
but actually-healthy sandbox and landed in the running agent session.

**4. The two failure modes in #14 are not contradictory — they're the two
sides of one boundary.** "No sandbox behind" = killed before the point of no
return (Finding 2). "Held the name" = killed after it (Finding 3, plus every
stuck-`Provisioning` case also holds the name). There is no observed case of
a container existing without its sandbox record, or vice versa in a
*recoverable* way — the stuck-`Provisioning` case has a record but never a
container.

**5. `sandbox delete` on a stuck-`Provisioning` sandbox reports `Sandbox 'X'
not found` but the delete still succeeds.** Confirmed by running `sandbox
list` immediately after: empty, and the name is immediately reusable. This
contrasts with deleting a normal `Ready` sandbox, which reports `✓ Deleted
sandbox X` and takes ~20–30s (`Ready` → `Deleting` while the container
stops and is removed, observed via `podman ps -a` status `Stopping
(starting)`). The misleading message on the stuck case is worth fixing
upstream or at least not trusting literally in `komora rm`'s own success
reporting — check `sandbox list` after, not the message.

**6. No reliable signal distinguishes an orphaned volume from one belonging
to a stopped-but-intact sandbox.** `openshell sandbox delete` never removes
`komora`'s volumes (by design — volume removal is `komora rm`'s job, with
deliberately higher intent required, per #14). So after any `sandbox
delete`, the repo and profile volumes remain, unreferenced by any sandbox —
identical in every observable respect to a volume left behind by a create
that got stuck in `Provisioning` and was then deleted. Checked:
  - `podman volume inspect --format .MountCount` stays `0` even while a
    sandbox is actively `Ready` and mounting the volume (OpenShell's Podman
    driver goes through the Podman API, not the `podman` CLI's mount
    accounting) — not a usable liveness signal.
  - `openshell sandbox list -o json` exposes each sandbox's `labels`
    (including `komora.slug`), which can be cross-referenced against a
    volume's `komora.repo`/slug — but this only tells you "no sandbox
    currently references this volume," which is true for both an orphan and
    an intentionally-idle repo volume between sessions. Volumes are meant to
    outlive sandboxes (#14's whole point), so "unreferenced" cannot mean
    "orphaned" on its own.
  - There is no `openshell sandbox stop` subcommand — only `create` /
    `delete` / `exec` / `connect` / `upload` / `download` / `ssh-config` /
    `provider`. `komora stop`'s planned semantics (#7's roadmap, #24) may
    need to mean "stop the underlying container via `podman stop`" directly,
    since OpenShell exposes no sandbox-level stop of its own. Worth
    confirming before designing `cmd_stop`.

## Confirmed

- The two failure modes #14 flagged are one boundary, not two bugs (Finding 4).
- A sandbox interrupted early enough leaves no container and a permanently
  stuck `Provisioning` record that holds its name (Finding 2).
- A sandbox interrupted late enough is unaffected — it completes normally
  server-side regardless of the local client (Finding 3).
- Volumes are never left mid-write by `komora`'s own priming, because that
  step fully precedes and is independent of `openshell sandbox create`
  (Finding 1).
- `sandbox delete`'s "not found" message on a stuck sandbox is misleading,
  not indicative of failure (Finding 5).

## Unresolved

- **No mechanical way to tell an orphaned volume from an intact one.**
  (Finding 6) A cleanup command can enumerate volumes with no matching live
  sandbox, but cannot know whether that's because create failed midway or
  because the developer simply isn't running a sandbox right now — both are
  the same observable state. This is not a gap in this investigation; it
  appears to be a real absence of a signal in the current Podman/OpenShell
  surface. `ls`/`rm` (#24) may need to treat *all* unreferenced `komora`
  volumes as normal (never auto-flagged as orphans), or record creation
  intent somewhere (e.g., a marker file inside the volume written only after
  a full successful create) if distinguishing them turns out to matter.
- **Whether the stuck-`Provisioning` window has a fixed duration or depends
  on gateway load/timing was not established** — only that it exists and is
  narrow (~1–2s against a warm gateway and cached image on this machine).
  Not verified against a cold gateway or under concurrent sandbox creation.
- **Whether OpenShell itself ever times out a stuck-`Provisioning` sandbox
  on a longer horizon** (hours) was not tested — only confirmed it does not
  self-resolve within ~60s.
