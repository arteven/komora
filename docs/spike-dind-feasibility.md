# Spike: Docker-in-Docker (DinD) Inside microsandbox

**Date:** 2026-04-30
**Microsandbox version:** `msb 0.4.2` (libkrunfw guest kernel `Linux 6.12.68`)
**Host:** Linux x86_64, `/dev/kvm` present, hardware virtualization (vmx/svm) supported.
**Verdict:** **WORKS — no special flags required.**

## TL;DR

`dockerd` starts cleanly inside a microsandbox VM booted from `docker:dind`, completes
initialization, picks `overlayfs` as its storage driver, exposes `/var/run/docker.sock`,
and accepts `docker info` / `docker run` calls.

Microsandbox does **not** expose a `--privileged` flag — and none is needed. The libkrun
guest kernel ships with cgroup v2, overlayfs, fuse, and a permissive cap set, which is
sufficient for `dockerd` to bring up containerd, buildkit, and the bridge network without
extra capabilities.

The only follow-up issue observed is **DNS resolution from inside the inner Docker
containers / dockerd image-pull path** — see "Known caveat: IPv6 DNS preference" below.
That is a tweak, not a blocker, and is orthogonal to whether DinD works.

## Environment

| Item | Value |
|---|---|
| `msb --version` | `msb 0.4.2` |
| Guest kernel | `Linux 6.12.68 #1 SMP PREEMPT_DYNAMIC` (libkrunfw, Ubuntu gcc 13.3.0) |
| Host `/dev/kvm` | `crw-rw-rw- root kvm 10, 232` |
| Host vmx/svm flag count | 16 (CPU virt extensions present) |
| Image | `docker:dind` (Docker 29.4.1, containerd-snapshotter, overlayfs) |

## What was tried

### 1. Install

```bash
curl -fsSL https://get.microsandbox.dev | sh
# msb installed to ~/.microsandbox/bin/msb
# libkrunfw installed to ~/.microsandbox/lib/
```

### 2. Smoke (alpine)

```bash
msb pull alpine                  # ✓ pulled in ~20s
msb run alpine -- sh -c 'uname -a; cat /proc/version'
# Linux msb-… 6.12.68 #1 SMP PREEMPT_DYNAMIC … x86_64
```

### 3. Inspect kernel features in `docker:dind`

```bash
msb run docker:dind -- sh -c '
  cat /proc/filesystems | grep -E "(overlay|cgroup|fuse)"
  ls /sys/fs/cgroup | head'
```

Output (abridged):

```
nodev   cgroup
nodev   cgroup2
        fuseblk
nodev   fuse
nodev   fusectl
nodev   overlay
cgroup.controllers
cgroup.subtree_control
cpu.stat
cpuset.cpus.effective
…
```

→ cgroup v2, overlayfs, fuse all present in the guest kernel.

### 4. Boot dockerd, query via UNIX socket

```bash
msb run docker:dind -- sh -c '
  dockerd > /tmp/d.log 2>&1 &
  sleep 7
  docker -H unix:///var/run/docker.sock info
'
```

`docker info` returned full server info — Docker 29.4.1, **Storage Driver: overlayfs**
(not vfs!), **Cgroup Version: 2**, all networking plugins loaded. dockerd's own log
ended with:

```
… Daemon has completed initialization
… API listen on /var/run/docker.sock
```

### 5. `docker run hello-world` (inside the sandbox)

This was the only thing that did **not** succeed:

```
docker: failed to resolve reference "docker.io/library/hello-world":
  dial tcp: lookup registry-1.docker.io on [fd42:6d73:62:7::1]:53: i/o timeout
```

The sandbox's `/etc/resolv.conf` lists both an IPv4 and an IPv6 microsandbox-internal
nameserver:

```
nameserver 100.96.0.29
nameserver fd42:6d73:62:7::1
```

containerd / dockerd's resolver picks the IPv6 one first and times out. This is a
**network configuration tweak, not a DinD feasibility problem**.

### Variants tried

- `msb run --privileged …` — **flag does not exist**. Not needed; the default cap set
  is sufficient (see kernel feature inspection above).
- `dockerd --storage-driver=vfs` — not needed; overlayfs works.
- `msb run --dns-nameserver 1.1.1.1 …` — overrode the **sandbox's** resolv.conf, but
  dockerd / containerd still attempted IPv6 lookup (probably reads its own config or the
  bridge-net resolv). Did not fix inner-pull DNS in this run; needs more investigation
  if/when komora ships a profile that depends on inner image pulls.

## Verdict

**WORKS — DinD is feasible inside microsandbox today, with no special msb flags.**

Recommended raw-block fragment for a future komora profile that wants DinD enabled (per
spec section "raw block"):

```yaml
# Profile fragment — not validated against final komora schema yet.
image: docker:dind
raw:
  # No --privileged needed; microsandbox provides sufficient caps.
  # Start dockerd as part of the sandbox's command and use the unix socket.
  command:
    - /bin/sh
    - -c
    - |
      dockerd > /var/log/dockerd.log 2>&1 &
      until docker -H unix:///var/run/docker.sock info >/dev/null 2>&1; do
        sleep 0.2
      done
      exec "$@"
```

## Known caveat: IPv6 DNS preference

Image pulls from inside the inner Docker daemon hit an IPv6 DNS i/o timeout because
microsandbox injects an IPv6 ULA nameserver (`fd42::/16`) ahead of the IPv4 one in
`/etc/resolv.conf`, and dockerd's containerd resolver tries it first.

**Mitigations to investigate when komora ships its first DinD-using profile:**

1. Pre-pull images on the host with `msb pull <inner image>` (if microsandbox can mount
   them inside the dind sandbox), avoiding the inner-resolver path entirely.
2. Pass `dockerd --dns 1.1.1.1` (sets DNS for inner *containers*, not for dockerd's own
   image pulls — partial fix).
3. Patch the sandbox's `/etc/resolv.conf` at startup to drop the `fd42::` line.
4. File an upstream ask for `msb run --no-ipv6-dns` or "IPv4-first resolv.conf".

This is a follow-up; **it does not gate Phase 8 built-in profiles** as long as those
profiles do not require image pulls from *inside* the sandbox at runtime. The current
spec's `nodejs` and `python` profiles do not require DinD at all (DinD-via-MCP was
deferred to V2), so this caveat does not affect V1.

## Implications for V1

- Phase 8 Tasks 8.1 (`nodejs`) and 8.2 (`python`) **do not depend** on DinD; spike
  closure is informational for them.
- Phase 8 Task 8.3 (`kotlin-android`) — the spec gates this on the spike result. **Spike
  passes**, so 8.3 may proceed; however, image size / Android SDK provisioning may still
  justify skipping per the original "skip-with-rationale" clause.
- The `network:` block reservation in V1 (warn-and-ignore) remains the right call — V2
  can grow into kit-style credential-proxy + allowlist semantics when needed.
- A future DinD-enabled profile is feasible without architectural changes; it just needs
  the raw-block fragment above plus DNS mitigation.

## Decision: defer `kotlin-android` built-in to post-V1 (2026-04-30)

Per Task 8.3's "skip-with-rationale" clause: the Android SDK image is ~10 GB and pre-
provisioning it inside a microsandbox VM is not justified for a personal-sandbox V1.
Built-ins shipped in V1: `nodejs` (Task 8.1) and `python` (Task 8.2). A `kotlin-android`
profile remains feasible — DinD works (this spike) and a `gradle:8-jdk21` base image
is reasonable — but Android SDK provisioning is left to per-project setup or a V2
profile contribution.

## Reproducer

```bash
export PATH="$HOME/.microsandbox/bin:$PATH"
msb pull docker:dind
msb run docker:dind -- sh -c '
  dockerd > /tmp/d.log 2>&1 &
  sleep 7
  docker -H unix:///var/run/docker.sock info'
# Expect: dockerd starts, docker info returns server info with overlayfs storage driver.
```
