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

_(filled in after probes)_

## Comparison table

| Strategy | Pre-existing host file writable inside? | Container-created file owned by host user? | Non-root, non-host-uid image user | Failure mode |
|---|---|---|---|---|
| plain `-v host:ctr` | | | | |
| `--userns=keep-id` | | | | |
| `--userns=keep-id:uid=N,gid=N` | | | | |
| `-v host:ctr:U` | | | | |
| `-v host:ctr:idmap` | | | | |
| `-v host:ctr:idmap=uids=...;gids=...` | | | | |

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
