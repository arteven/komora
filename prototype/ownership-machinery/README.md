# PROTOTYPE — ownership machinery around keep-id

Throwaway spike for [#5](https://github.com/arteven/komora/issues/5). **Not
production code.** Kept on this branch as a primary source for
[ADR-0002](../../docs/adr/0002-ownership-machinery-around-keep-id.md); the
validated decisions live in the ADR, not here.

## Run it

```sh
podman build -t localhost/komora-ownspike:latest -f Containerfile .
podman build -t localhost/komora-ownspike-git:latest -f Containerfile.git .
./probe.sh
```

Every probe is a real `podman run`; state is printed after each step. Scratch
dirs go under `/tmp`, named volumes are prefixed `ownspike-` and recreated on
each run.

Environment it was run against: Podman 6.0.1, crun 1.28, Linux 6.12,
subuid/subgid `100000+65536`, host uid/gid 1000.

## What it found

| Probe | Result |
| --- | --- |
| 1 | Fresh named volumes under keep-id need **no chown** — the seeding container other projects ship is unnecessary here |
| 2 | Volume written without keep-id, then used with it → `Permission denied`. The one case needing repair |
| 3 | A root-chown container **without** keep-id makes it worse (its "1000" = host 100999). Repair must run `keep-id + --user 0:0` |
| 4 | Escape mode = root, keep-id omitted. Workspace stays host-owned — but privilege-dropping builds can't write at all |
| 5 | Subuid-poisoned host files: host `chown` refused; `podman unshare chown -R 0:0` repairs |
| 6 | Round-trip, git (both directions, no `safe.directory` complaint), 3000 files — all clean |
| 7 | keep-id has no measurable startup cost |

A first pass had three broken probes (missing mount dir, `git` absent from
`base-devel`, unquoted loop var) that produced false negatives; `probe.sh` here
is the corrected version and every claim above reproduces from a clean start.
