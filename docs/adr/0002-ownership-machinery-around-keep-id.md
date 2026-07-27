# ADR-0002: Ownership machinery around keep-id

- **Status**: Accepted
- **Date**: 2026-07-27
- **Ticket**: [#5 Build the ownership machinery around keep-id](https://github.com/arteven/komora/issues/5)
- **Builds on**: [#2 rootless-ownership research](https://github.com/arteven/komora/blob/research/ownership-probes/docs/research/rootless-ownership.md)

## Context

#2 settled the flag: `--userns=keep-id:uid=N,gid=N`, where N is the image's own
uid/gid, gives host-correct ownership in both directions even for a non-root
image user. It also warned that the flag is **necessary but not sufficient** —
every surveyed project shipping `keep-id` still needed follow-up machinery for
named volumes, pre-existing caches, and package installs.

This ticket built a throwaway spike (real `podman run` probes, same environment
as #2: Podman 6.0.1, crun 1.28, Linux 6.12, subuid 100000+65536) to find out
what that machinery actually has to be. Two of the expected pieces turned out
to be unnecessary, and one expected piece turned out to be actively wrong as
the surveyed projects implement it.

## Decision

### 1. Fresh named volumes need no chown at all

A named volume mounted under `keep-id` — empty, or mounted over a path the
image populated — comes out writable by the agent and host-owned, with no
seeding step. The disposable root-chown container that `ai-pod` runs on first
use (`seed_mask_volume`) is **not needed** for komora's case.

The reason the surveyed projects need it and komora does not: they chown to an
identity established outside the chamber's userns. Under `keep-id`, podman
already creates the volume with the mapped ownership.

### 2. When repair *is* needed, it must run inside the chamber's own userns

Repair is needed for one case: a volume written **without** `keep-id` (an
earlier run, a different flag set, a tool invoked by hand) and then used with
it. The agent gets `Permission denied`.

The repair that looks obvious is wrong:

```
# WRONG — poisons the volume further
podman run --rm --user 0:0 -v vol:/vol IMG chown -R 1000:1000 /vol
```

That container's uid map is the rootless default (`0 → host 1000`,
`1 → host 100000+`), so its "1000" means **host 100999**, not the host user.
The chown appears to succeed and leaves the volume *less* usable than before.
This is the same class of error as the `:U` trap recorded in #2, reached by a
different route.

The correct repair runs root **inside the keep-id mapping**, where "1000" means
what the chamber means by it:

```
podman run --rm --userns=keep-id:uid=N,gid=N --user 0:0 -v vol:/vol IMG \
  chown -R N:N /vol
```

Verified: agent write fails before, succeeds after. Cost ~0.24s, idempotent,
cheap enough to run unconditionally on volume creation rather than detecting
the bad case.

### 3. Escape mode is `--user 0:0` with keep-id omitted, and it is root-only

Package installs are the workflow `keep-id` breaks: `pacman` under the agent
uid gives `error: you cannot perform this operation unless you are root`, and
`sudo` is unavailable (no password). The escape is the same image run as root
with `keep-id` omitted — `agent-sandbox`'s `root()` profile shape.

In that mode the workspace stays correctly owned, because container root maps
1:1 to the host user under the rootless default. Files root creates are
host-owned and host-editable.

**The limit, which the surveyed projects do not record:** in escape mode a
process that *drops privileges* — the `makepkg`/`npm` pattern — cannot write to
the workspace at all, because container uid 1000 maps to host 100999 there.
It fails loudly (`Permission denied`) rather than silently poisoning ownership.

Escape mode is therefore for **root-only work**, not a general-purpose "run it
without keep-id" mode. komora must make it an explicit, narrow, per-command
escape — never a silent fallback when a keep-id run fails, because the
privilege-dropping case would fail there too and in a more confusing way.

### 4. Repair of already-wrong host files: `podman unshare`

Host files already owned by a subuid (from `:U`, or an escape-mode mistake)
cannot be repaired by the host user — `chown` returns `Operation not
permitted`. The rootless-correct tool is:

```
podman unshare chown -R 0:0 <path>
```

`0:0` inside the unshare namespace *is* the host user. Verified:
`101000:101000` → `1000:1000` across a tree, host-editable afterward.

Detection is cheap enough to run pre-flight: `find <workspace> ! -uid $(id -u)`.
Note that plain `find` cannot stat subuid-owned directories as the host user,
so tooling that inspects possibly-poisoned trees must go through
`podman unshare` or `stat` per path.

## What the awkward cases showed

All clean, no extra machinery required:

- **Round-trip** (create inside → edit on host → edit inside) works with no
  ownership drift.
- **Git** round-trips in both directions, including a host-created repo
  committed to from inside — and raises **no `safe.directory` complaint**,
  because keep-id makes ownership genuinely match rather than merely resemble.
- **Many small files** (3000, the `node_modules` shape): 0.26s total, all
  host-owned. No per-file cost.
- **keep-id startup cost**: none measurable (0.231s plain vs 0.256s keep-id,
  within noise).

## Consequences

**Accepted:**

- Escape mode covers root-only work. A build that needs both package installs
  *and* privilege-dropping is not served by either mode, and would need the
  install baked into the image instead. No instance of this has come up yet.
- The repair container is a second `podman run` in the volume-creation path.
  At ~0.24s it is not worth optimising away or making conditional.

**Gained:**

- No seeding step in the common path — fresh volumes just work.
- Both repair paths are one command each, with a clear rule behind them.

## The rule behind all of it

> A uid number only means something **relative to a userns mapping**. Any
> operation that names a uid — `chown`, `--user`, `:U` — must run in the same
> mapping as the thing it is naming it for.

Every failure in this ticket and in #2's `:U` trap is one violation of that
rule. `id` inside a container is not evidence of host identity; the uid map is.

## Revisit if

- A real workflow needs package installs and privilege-dropping in the same
  run, which escape mode cannot serve.
- Podman changes `keep-id` volume-creation behaviour such that fresh volumes
  stop arriving correctly owned — that would restore the seeding step.
