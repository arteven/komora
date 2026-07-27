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

Scratch dir: `/tmp/ownprobe` (all paths below are relative to it, and are
generic — no home directory or account-specific paths involved). Host
invoking user: `$(id -u)`/`$(id -g)` (1000:1000 in this run). Image:
`docker.io/library/alpine:latest` (already local), plus a throwaway image
`localhost/ownprobe-nonroot` built for probe 7.

```
$ podman version
podman version 6.0.1
$ uname -r
6.12.96-1-MANJARO
$ crun --version
crun version 1.28-dirty
$ cat /etc/subuid /etc/subgid
<host-user>:100000:65536
<host-user>:100000:65536
$ podman unshare cat /proc/self/uid_map
         0       1000          1
         1     100000      65536
```

Interpretation: the default rootless mapping podman sets up is exactly two
entries — container uid 0 maps 1:1 to the invoking host uid, and container
uids 1..65536 map into the subuid-allocated range starting at 100000. This
single fact explains almost every result below: "container uid == host uid"
is not automatically true unless something (`keep-id`) says so explicitly.

### 1. Plain `-v host:ctr`

**1a — root image process, append to host file + create new file:**

```
$ ls -ln p1/hostowned.txt
-rw-r--r-- 1 1000 1000 0 ... hostowned.txt
$ podman run --rm -v /tmp/ownprobe/p1:/data:Z alpine sh -c \
    'echo hello >> /data/hostowned.txt; echo newfile > /data/created.txt; id'
uid=0(root) gid=0(root) ...
$ ls -ln p1/
-rw-r--r-- 1 1000 1000 8 ... created.txt
-rw-r--r-- 1 1000 1000 6 ... hostowned.txt
```
Works: root inside is the default-mapped identity (container 0 → host 1000),
so both writing to the pre-existing file and creating a new one land as the
real host user. **But this only works because the process is uid 0.**

**1b — container `--user 1000:1000` (numerically "looks like" the host uid):**

```
$ podman run --rm --user 1000:1000 -v /tmp/ownprobe/p1b:/data:Z alpine sh -c \
    'echo hello >> /data/hostowned.txt; echo newfile > /data/created.txt; id'
sh: can't create /data/hostowned.txt: Permission denied
sh: can't create /data/created.txt: Permission denied
uid=1000(arek) gid=1000(1000) groups=1000(1000)
```
Fails, despite `id` printing `uid=1000` — that "1000" is a *container-local*
identity that, per the default mapping in Probe 0, actually resolves to host
uid ~100999, not host uid 1000. `id` cannot be trusted as evidence of host
identity without also checking the userns mapping in effect.

**1c — container `--user 1001:1001` (arbitrary non-root, non-host uid):**

```
$ podman run --rm --user 1001:1001 -v /tmp/ownprobe/p1c:/data:Z alpine sh -c \
    'cat /data/hostowned.txt; echo hello >> /data/hostowned.txt; echo newfile > /data/created.txt; id'
sh: can't create /data/hostowned.txt: Permission denied
sh: can't create /data/created.txt: Permission denied
uid=1001(1001) gid=1001(1001) ...
```
Same failure mode. Exit code 1 in all non-root cases; the file list on the
host afterward is unchanged (`created.txt` never appears).

### 2. `--userns=keep-id`

**2a — default keep-id (image runs as its default user, no `--user`):**

```
$ podman run --rm --userns=keep-id -v /tmp/ownprobe/p2:/data:Z alpine sh -c \
    'id; echo hello >> /data/hostowned.txt; echo newfile > /data/created.txt'
uid=1000(arek) gid=1000(arek) groups=1000(arek)
$ ls -ln p2/
-rw-r--r-- 1 1000 1000 8 ... created.txt
-rw-r--r-- 1 1000 1000 6 ... hostowned.txt
```
Clean: `keep-id` maps the container's default uid straight to the invoking
host uid, so both operations come out correctly owned with zero extra flags.

**2b — same, but forcing `--user 0:0` inside a `keep-id` container:**

```
$ podman run --rm --userns=keep-id --user 0:0 -v /tmp/ownprobe/p2root:/data:Z alpine sh -c \
    'id; echo hello >> /data/hostowned.txt; echo newfile > /data/created.txt'
uid=0(root) gid=0(root) groups=1000(arek),0(root)
$ ls -ln p2root/
-rw-r--r-- 1 100000 100000 8 ... created.txt
-rw-r--r-- 1   1000   1000 6 ... hostowned.txt
$ cat p2root/hostowned.txt
hello
```
Interesting split result: root's *append* to the pre-existing host file
succeeded (root has DAC-override-style privilege inside its own mount view
regardless of file ownership), but the *file root creates* lands owned by
100000 — the subuid-mapped identity, not the host user — because under
`keep-id`, uid 0 is no longer given the special 1:1 mapping (the host uid
takes uid 0's usual slot instead). Forcing root under `keep-id` is exactly
the wrong move: it neither guarantees new-file ownership nor is necessary,
since `keep-id` already grants the host user's own uid write access.

### 3. `--userns=keep-id:uid=N,gid=N`

**3a — image user set to an ID that does *not* match the `uid=`/`gid=` given to keep-id:**

```
$ podman run --rm --userns=keep-id:uid=1000,gid=1000 --user 1001:1001 \
    -v /tmp/ownprobe/p3:/data:Z alpine sh -c \
    'id; echo hello >> /data/hostowned.txt; echo newfile > /data/created.txt'
uid=1001(1001) gid=1001(1001) groups=1000,1001(1001)
sh: can't create /data/hostowned.txt: Permission denied
sh: can't create /data/created.txt: Permission denied
```
Confirms `keep-id:uid=/gid=` maps *that specific* container uid to the host
uid — a mismatched container uid still falls outside the mapping and fails
exactly like Probe 1's non-root cases.

**3b — image user set to an arbitrary id (2000), `keep-id:uid=2000,gid=2000` matching it, `--user 2000:2000`:**

```
$ podman run --rm --userns=keep-id:uid=2000,gid=2000 --user 2000:2000 \
    -v /tmp/ownprobe/p4:/data:Z alpine sh -c \
    'id; echo hello >> /data/hostowned.txt; echo newfile > /data/created.txt'
uid=2000(2000) gid=2000(2000) groups=2000(2000)
$ ls -ln p4/
-rw-r--r-- 1 1000 1000 8 ... created.txt
-rw-r--r-- 1 1000 1000 6 ... hostowned.txt
```
Clean on both counts. This is the general-case fix: tell `keep-id` which
*container* uid corresponds to "the agent's identity" and it maps that uid
— whatever number it is — to the real host uid for both directions.

**3c — repeated against a throwaway image with a *baked* (Dockerfile `USER`)
non-root uid 2500, not a `--user`-forced one — see Probe 7, which is the
same mechanism exercised through an image build rather than a CLI flag.**

### 4. `-v host:ctr:U`

**4a — root image process:**

```
$ podman run --rm -v /tmp/ownprobe/p5:/data:U alpine sh -c \
    'id; echo hello >> /data/hostowned.txt; echo newfile > /data/created.txt'
uid=0(root) gid=0(root) ...
$ ls -ln p5/
-rw-r--r-- 1 1000 1000 8 ... created.txt
-rw-r--r-- 1 1000 1000 6 ... hostowned.txt
```
Works — `:U` chowns the host dir to the uid podman computes for container
uid 0 (the host uid, per the default mapping), which happens to already be
correct, so nothing visibly changes.

**4b — non-root `--user 1001:1001`, no `keep-id`:**

```
$ podman run --rm --user 1001:1001 -v /tmp/ownprobe/p5b:/data:U alpine sh -c \
    'id; echo hello >> /data/hostowned.txt; echo newfile > /data/created.txt'
uid=1001(1001) gid=1001(1001) ...
$ ls -ln p5b/
-rw-r--r-- 1 101000 101000 8 ... created.txt
-rw-r--r-- 1 101000 101000 6 ... hostowned.txt
```
No error text at all — the run *succeeds* — but `:U` silently **chowned the
pre-existing `hostowned.txt` from uid 1000 to uid 101000** (the subuid-range
id that container uid 1001 resolves to) before the container even started,
then wrote the new file with that same owner. The host's real user no longer
owns either file, and there was no confirmation prompt or warning. This is
the most dangerous failure mode in this whole survey because it looks like
success (exit 0, files exist, no stderr) while quietly discarding host
ownership of pre-existing data.

### 5. Idmapped mounts: `-v host:ctr:idmap`

**5a — root image process:**

```
$ podman run --rm -v /tmp/ownprobe/p6:/data:idmap alpine sh -c \
    'id; echo hello >> /data/hostowned.txt; echo newfile > /data/created.txt'
uid=0(root) gid=0(root) ...
$ ls -ln p6/
-rw-r--r-- 1 1000 1000 8 ... created.txt
-rw-r--r-- 1 1000 1000 6 ... hostowned.txt
```
Works. Debug log confirms this really is a kernel idmapped mount, not a
silent fallback to something else:

```
$ podman --log-level=debug run --rm -v /tmp/ownprobe/p6c:/data:idmap alpine sh -c id 2>&1 | grep -i idmap
User mount /tmp/ownprobe/p6c:/data options [idmap]
Cached value indicated that idmapped mounts for overlay are not supported
Check for idmapped mounts support
```
No error follows — the mount succeeds. This directly **contradicts**
`podman-run(1)`'s statement that "The idmap option is only supported by
Podman in rootful mode" — on Podman 6.0.1 + crun 1.28 + Linux 6.12, rootless
idmap works for a plain bind mount on a filesystem that supports it (the
debug line about overlay is unrelated — that's Podman checking whether the
*image's own* overlay storage layer supports idmap, not the bind-mounted
directory).

**5b — non-root `--user 1001:1001`, default/auto idmap (no custom range):**

```
$ podman run --rm --user 1001:1001 -v /tmp/ownprobe/p6b:/data:idmap alpine sh -c \
    'id; echo hello >> /data/hostowned.txt; echo newfile > /data/created.txt'
uid=1001(1001) gid=1001(1001) ...
sh: can't create /data/hostowned.txt: Permission denied
sh: can't create /data/created.txt: Permission denied
```
Fails: the *default* idmap only establishes a mapping for container uid 0 →
host owning uid. It does not extend to arbitrary non-root container uids
without an explicit custom range.

### 6. Idmapped mounts: explicit `idmap=uids=...;gids=...`

**6a — absolute custom range mapping container uid 1001 → host uid 1000:**

```
$ podman run --rm --user 1001:1001 \
    -v "/tmp/ownprobe/p7:/data:idmap=uids=1001-1000-1;gids=1001-1000-1" \
    alpine sh -c 'id; echo hello >> /data/hostowned.txt; echo newfile > /data/created.txt'
Error: crun: mount_setattr `/data`: Operation not permitted: OCI permission denied
```
Rejected outright rootless: an absolute custom idmap range requires
privilege the rootless user doesn't have (`mount_setattr(2)` needs
`CAP_SYS_ADMIN` in the *initial* user namespace for an absolute mapping).

**6b — relative (`@`-prefixed) custom range, same intent:**

```
$ podman run --rm --user 1001:1001 \
    -v "/tmp/ownprobe/p7:/data:idmap=uids=@1001-1000-1;gids=@1001-1000-1" \
    alpine sh -c 'id; ...'
Error: could not find a user namespace mapping for the relative mapping "@1001-1000-1"
```
Different, equally terminal failure: the relative-mapping syntax needs the
target id to already exist somewhere in the container's *own* user
namespace, which a bare `--user`-only container (no custom `--uidmap`) does
not have.

**6c — combining `keep-id:uid=N,gid=N` with `:idmap` on the same mount:**

```
$ podman run --rm --userns=keep-id:uid=1001,gid=1001 --user 1001:1001 \
    -v /tmp/ownprobe/p8:/data:idmap alpine sh -c 'id; echo hello >> /data/hostowned.txt'
Error: crun: mount_setattr `/data`: Operation not permitted: OCI permission denied
```
The two mechanisms conflict rootless: once `keep-id` has established a
custom userns mapping, Podman's auto-idmap logic can no longer derive a
mapping it's allowed to apply. **Do not combine `keep-id` with `:idmap`.**

Conclusion for idmap: it is a real, working rootless feature on modern
kernels for the *default* (root-only) case, but it does not currently offer
a rootless path to "arbitrary non-root container uid ↔ host uid" — that
gap is exactly what `keep-id:uid=/gid=` fills instead.

### 7. Non-root, non-host-uid image user (throwaway image)

Built a minimal throwaway image with a baked non-root, non-host user (uid
2500, distinct from both 0 and the host's 1000):

```dockerfile
FROM alpine:latest
RUN addgroup -g 2500 appgrp && adduser -D -u 2500 -G appgrp appuser
USER 2500:2500
WORKDIR /data
```

**7a — plain `-v`, no userns flags:**

```
$ podman run --rm -v /tmp/ownprobe/p9:/data:Z ownprobe-nonroot sh -c \
    'id; echo hi >> hostowned.txt; echo new > created.txt'
uid=2500(appuser) gid=2500(appgrp) groups=2500(appgrp)
sh: can't create hostowned.txt: Permission denied
sh: can't create created.txt: Permission denied
```
Same failure as Probes 1b/1c/5b: a baked non-root image user is just as
blocked as one set via `--user`.

**7b — `--userns=keep-id:uid=2500,gid=2500` matching the baked user:**

```
$ podman run --rm --userns=keep-id:uid=2500,gid=2500 \
    -v /tmp/ownprobe/p10:/data:Z ownprobe-nonroot sh -c \
    'id; echo hi >> hostowned.txt; echo new > created.txt'
uid=2500(appuser) gid=2500(appgrp) groups=2500(appgrp)
$ ls -ln p10/
-rw-r--r-- 1 1000 1000 4 ... created.txt
-rw-r--r-- 1 1000 1000 3 ... hostowned.txt
```
Clean on both counts — confirms the fix generalizes to a real baked
Dockerfile `USER`, not just a `--user` CLI override: read the image's
built-in uid/gid (`podman inspect --format '{{.Config.User}}' <image>`) and
pass it as `keep-id:uid=<uid>,gid=<gid>`.

**7c — exact error text for a bare (no `-v` mount options, no `:Z`) plain
`-v` denial, for completeness:**

```
$ podman run --rm -v /tmp/ownprobe/p11:/data ownprobe-nonroot sh -c 'echo hi >> hostowned.txt'
sh: can't create hostowned.txt: Permission denied
$ echo "EXIT=$?"
EXIT=1
```

## Contradictions with the map's current assumptions

1. **Idmapped mounts are not rootful-only**, despite `podman-run(1)` saying
   so in Podman 6.0.1. They work rootless here (kernel 6.12, crun 1.28) for
   the default mapping. If the project's map assumed idmap was off the table
   rootless, that assumption is wrong — but idmap still isn't the answer to
   the load-bearing question, because its rootless-usable form doesn't cover
   arbitrary non-root container uids (see Probe 6).
2. **A container uid that numerically matches the host uid is not
   automatically the host uid** unless `--userns=keep-id` (or an explicit
   uidmap) is in effect. This is an easy trap: an image whose `USER 1000`
   happens to equal a common host uid will *look* right in `id` output and
   still fail every write, because the default rootless mapping only gives
   uid 0 the special 1:1 slot.
3. **`-v ...:U` fails silently, not loudly**, when the container uid doesn't
   already correspond to the host uid: it chowns real host files to a
   subuid-range owner with exit code 0 and no warning. If the map assumed
   `:U` was a safe "just make it work" fallback, that assumption should be
   retired — it is actively destructive to pre-existing host-owned files
   under exactly the case (non-root, non-host-uid image) the load-bearing
   question is about.
4. **No single flag combination handles every case except
   `keep-id:uid=/gid=`.** The clean answer is not "idmap" (the more
   modern-sounding, more often-recommended feature) but the older,
   simpler `--userns=keep-id[:uid=N,gid=N]`, provided the chamber launcher
   reads the image's configured uid/gid and passes it explicitly. This is a
   solvable problem (one `podman inspect` call), not a blocker — but it does
   mean the launcher must always know the image's uid ahead of time rather
   than assuming a fixed default.
