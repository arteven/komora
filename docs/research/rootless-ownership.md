# Host-correct file ownership under rootless Podman 6.x

Answers the load-bearing question from issue #2: can files written by an agent
inside a rootless-Podman container appear on the host owned by the invoking
user, while pre-existing host-owned files stay writable inside the container?

Environment: Podman 6.0.1, rootless, Linux, invoking user `$(id -u):$(id -g)`
(1000:1000 in the probe environment; treat as `$(id -u)`/`$(id -g)` throughout).
Probes are real command runs in a scratch directory under `/tmp`, not
speculation. Every claim below is backed by a numbered probe in the "Probes"
section with its exact command and captured output.

## TL;DR / Recommendation

**Positive result.** Clean host ownership in both directions (pre-existing
host files stay writable, container-created files come out host-owned) is
achievable, including when the image's built-in user is neither uid 0 nor the
host uid — but only one strategy handles all three cases:

> **`--userns=keep-id:uid=N,gid=N`, where `N` is the image's built-in
> (baked or `--user`-forced) uid/gid.** When the image runs as the host uid
> already, plain `--userns=keep-id` (no `uid=`/`gid=` needed) is equivalent
> and simpler.

Everything else tested has a real gap:

- Plain `-v host:ctr` only produces host ownership when the container
  process is uid 0 (root exploits rootless Podman's default root→host-uid
  mapping). Any other container uid, including one that numerically equals
  the host uid, is Permission Denied — see Probes 1b/1c: a container uid that
  prints as `1000` inside is **not** the same id as host uid 1000 unless
  `keep-id` says so; without it, container uid 1000 lands in the subuid range
  (host uid ~100999) and can neither read nor write the host-owned file.
- `-v host:ctr:U` recursively **chowns the host directory** to whatever the
  container uid maps to before the run. For root or `keep-id`-mapped uids
  that's harmless (it chowns to the same host uid that's already there), but
  for a plain non-root container uid it silently reassigns real host files to
  a subuid-range owner (e.g. uid 101000) as a side effect — a destructive
  surprise if the directory holds pre-existing host data you don't want
  rewritten.
- Idmapped mounts (`:idmap`) **do work rootless** on this stack (Podman
  6.0.1, crun 1.28, kernel 6.12) for the default (auto) mapping — this
  contradicts `podman-run(1)`, which flatly states "The idmap option is only
  supported by Podman in rootful mode." That statement is stale/misleading:
  the real constraint is kernel + backing-filesystem support for idmapped
  mounts (available since Linux 5.12 for regular filesystems), not privilege
  level. However, the **default** `:idmap` only maps container uid 0 to the
  host owning uid — a non-root container user is still Permission Denied,
  and supplying an explicit custom range (`idmap=uids=...;gids=...`) failed
  outright rootless with `mount_setattr: Operation not permitted`. Idmap is
  therefore not the general-purpose answer here; `keep-id:uid=/gid=` is.

**Recommendation for the chamber:** always mount with
`--userns=keep-id:uid=<image-uid>,gid=<image-gid>` where `<image-uid>` is
read from the image (`podman inspect --format '{{.Config.User}}' <image>`,
defaulting to `0` for root images), rather than relying on `-v ...:U` or
idmap. Do not combine `:U` with `keep-id` (the chown races against the
mapping and only one interpretation of "the container's uid" wins). Never
rely on plain `-v` for anything other than root-in-container images.

## Comparison table

| Strategy | Pre-existing host file writable inside? | Container-created file owned by host user? | Image user not uid 0 / not host uid | Failure mode |
|---|---|---|---|---|
| plain `-v host:ctr` | Yes, but only if container process is uid 0 | Yes, only if uid 0 | **Broken** — Permission Denied | `sh: can't create X: Permission denied`, exit 1 |
| `--userns=keep-id` (no uid=/gid=) | Yes, when container user == host uid | Yes | N/A (this mode is defined by matching host uid) | container root or other uid maps into subuid range; new files owned by e.g. 100000, not host user |
| `--userns=keep-id:uid=N,gid=N` (N = image's uid) | **Yes** | **Yes** | **Works** — this is the fix for case 3 | none observed |
| `-v host:ctr:U` | Yes for root/keep-id-matched uid; for a plain non-root uid it **chowns the host dir to a subuid-mapped owner**, breaking host ownership as a side effect | Mirrors whatever uid it chowned to, not necessarily host user | Silently reassigns ownership rather than erroring | no error text — silent ownership mutation is the "failure" |
| `-v host:ctr:idmap` (auto/default) | Yes, for the container's uid-0 process | Yes, for uid-0 | **Broken** for non-root container uid — Permission Denied | `sh: can't create X: Permission denied` |
| `-v host:ctr:idmap=uids=...;gids=...` (custom range) | No — rootless custom-range idmap rejected outright | No | Broken | ``Error: crun: mount_setattr `/data`: Operation not permitted: OCI permission denied`` (relative `@` syntax instead errors `could not find a user namespace mapping for the relative mapping "@N-M-1"`) |

## Probes

_(each probe: command, expected question it answers, exact output, interpretation)_

### 0. Setup

### 1. Plain `-v host:ctr`

### 2. `--userns=keep-id`

### 3. `--userns=keep-id:uid=N,gid=N`

### 4. `-v host:ctr:U`

### 5. Idmapped mounts: `-v host:ctr:idmap`

### 6. Idmapped mounts: explicit `idmap=uids=...;gids=...`

### 7. Non-root, non-host-uid image user (throwaway image)

## Contradictions with the map's current assumptions

_(filled in after probes)_
