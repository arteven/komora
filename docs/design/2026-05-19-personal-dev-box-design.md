# Personal Dev Box — Design

**Date:** 2026-05-19
**Status:** Draft for review
**Scope:** Hard pivot of komora from per-workspace ephemeral sandboxes to a single persistent personal dev VM.

---

## 1. Goal

Replace the current "one microVM per workspace per agent" model with **one persistent microVM per host** that the user lives in instead of their physical machine. The VM contains all installed agents, multiple attached projects, skills, settings, tmux, and shell tooling. The host keeps important identity secrets out of the VM. The user can rebuild the VM with one command without losing anything they care about.

This is a rewrite, not an extension. The v2 per-workspace model is abandoned. Git history preserves it.

---

## 2. Constraints and decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Pivot style | Hard pivot — old per-workspace model goes away |
| VM topology | Single persistent VM, always-on |
| Project layout | Bind-mounted from host (user declares which paths) |
| Secrets model | Tiered: workload via microsandbox `secretEnv`, identity via `SSH_AUTH_SOCK` forwarding |
| Rebuild model | Layered — base image (baked) + manifest + personal-layer volume |
| Entry surface | sshd primary, `komora attach` (msb exec -t) fallback |
| Agents | Manifest-declared; installed in base image; invoked directly inside the box |
| Manifest | One file (`~/.config/komora/box.yaml`); per-project handled by `mise` / `direnv` baked into the image |
| Multi-host | Out of v1 scope; single-host only. Multi-host deferred to a later iteration |
| In scope for v1 | dockerd-in-VM (optional), resource caps, boot-time vs run-time secrets, full lifecycle commands, clipboard sync. GUI/browser only if microsandbox provides a display channel — otherwise deferred |
| Shape | Thin orchestrator around `msb` (Approach A) |

---

## 3. Architecture

### 3.1 Layers

```
┌──────────────────────── host ────────────────────────┐
│  ~/.config/komora/box.yaml      ◀── manifest         │
│  OS keychain (host)             ◀── secret values    │
│  <user-declared paths>          ◀── bind-mounted in  │
│                                                      │
│  komora CLI ─► msb daemon ─► VM                      │
└──────────────────────────────────────────────────────┘
```

The mount example `~/Projects/` is illustrative only; the user declares whichever host paths they want in `box.mounts`.

Three layers compose the box:

1. **Base image.** Built by `komora bake`. Contains distro, toolchains, agents, mise, direnv, sshd, tmux, shell, editor. Stored as a microsandbox snapshot. Rebuilt deliberately when toolchain/agent set changes.
2. **Manifest** (`box.yaml`). Declares which base snapshot, plus all run-time concerns: mounts, named volumes, secrets, network policy, port forwards, resource caps, optional features (dockerd, clipboard, and GUI/X11 only if microsandbox supports it).
3. **Personal layer.** A persistent location for the user's shell rc files, tmux config, nvim config, sshd host key, mise state — anything that should survive rebuilds. The user picks the backing in the manifest:
   - **Named microsandbox volume** (default) — fully managed by komora/msb. Recommended for a self-contained box.
   - **Host bind-mount** — point the personal layer at a directory on the host (e.g. a synced dotfiles dir). Useful when the user already manages this directory outside komora.

   Either way it survives rebuilds because it is not on the VM's ephemeral disk.

### 3.2 Boundaries

- **Host ↔ box.** Three channels:
  - `ssh` (primary) — interactive shells, editor remoting, scp, port forwarding, agent forwarding.
  - `msb exec -t` (fallback, behind `komora attach`) — when sshd is not yet up.
  - bind mounts — only the project directories the user explicitly lists.
- **Komora ↔ msb.** Komora shells out to `msb` CLI and uses the SDK where convenient. Komora does not reimplement microVM lifecycle, networking, or snapshotting.

### 3.3 Why this shape

The microsandbox 0.4.6 audit confirms `msb` provides: persistent named sandboxes, pause/resume, snapshots (disk-only), TLS-intercepted egress with allow/deny domains, `secretEnv` placeholder substitution, port forwarding, persistent volumes. Komora's job is the manifest, the tiered-secrets model, host-key stability across rebuilds, and gluing those to `msb` calls.

---

## 4. Components

### 4.1 Manifest resolver (`src/manifest/`)

Reads `~/.config/komora/box.yaml`, validates against JSON Schema, resolves into a fully-typed `ResolvedBox` object consumed by every command.

| File | Responsibility |
|---|---|
| `types.ts` | `BoxManifest`, `ResolvedBox`, `Mount`, `Volume`, `Secret`, `NetworkPolicy`, `Agent`, `Toolchain` |
| `schema.ts` | AJV JSON Schema for `box.yaml` |
| `load.ts` | YAML read + schema validation |
| `resolve.ts` | Expand secret references, resolve volume names, compute derived fields |

### 4.2 Box backend (`src/box/`)

Thin wrapper over `msb`. One implementation: microsandbox.

| File | Responsibility |
|---|---|
| `msb.ts` | Shell out to `msb` CLI (long-running, streaming) |
| `sdk.ts` | Use microsandbox TS SDK for short, structured calls |
| `lifecycle.ts` | `up`, `down`, `pause`, `resume`, `destroy` |
| `image.ts` | `bake` — build base image, snapshot it |
| `rebuild.ts` | Recreate VM from manifest + base snapshot, reattach volumes |
| `ssh.ts` | sshd readiness probe, host-key pinning via personal-layer volume |

### 4.3 Secrets (`src/secrets/`)

Tiered secret store backed by the host OS keychain.

| File | Responsibility |
|---|---|
| `keychain.ts` | OS keychain integration (libsecret / Keychain / DPAPI) |
| `tiers.ts` | Classify secrets as `workload` (injected into VM via `secretEnv` with domain binding) or `identity` (never enters VM; routed via `SSH_AUTH_SOCK` forwarding) |
| `inject.ts` | At box up time, materialize workload secrets as `secretEnv` declarations on the `msb` invocation |

### 4.4 Commands (`src/commands/`)

| Command | Description |
|---|---|
| `komora bake` | Build/refresh the base image. Reads `image:` section. Writes a snapshot. |
| `komora rebuild` | Recreate the VM. `msb create --replace` from base snapshot + manifest. Personal-layer volume and bind mounts preserved. |
| `komora up` | Start the VM (`msb start`). |
| `komora down` | Stop the VM (`msb stop`). |
| `komora pause` / `resume` | Map to `msb pause` / `msb resume`. |
| `komora destroy` | Remove the VM (`msb rm`). Volumes preserved unless `--volumes` passed. |
| `komora ssh` | Connect via forwarded sshd port. Verifies host key against personal-layer fingerprint. |
| `komora attach` | `msb exec -t bash` fallback when sshd is unavailable. |
| `komora secret set/list/rm` | Manage secrets in host keychain. Values never written to manifest. |
| `komora status` | Show: which host, VM state, attached volumes, port forwards, sshd readiness. |
| `komora logs` | `msb logs` passthrough. |

### 4.5 What goes away

| Removed | Reason |
|---|---|
| `src/agents/*.ts` (5 agent definition files) | Agents are baked into the image; no runtime agent registry |
| `src/commands/run.ts` | No per-workspace agent invocation through komora |
| `src/commands/create.ts` (workspace flavor) | Replaced by `rebuild` |
| `src/toolchains/*.sh` | Replaced by direct install steps in the bake recipe |
| Credential profile system (`--profile`) | Replaced by per-agent volumes + in-box agent config |
| Per-workspace `komora.config.yaml` | Replaced by single box manifest + `mise`/`direnv` per-project |
| Workspace slug + sandbox name derivation | Box has a fixed name per host |

---

## 5. Data — the manifest

### 5.1 Example `box.yaml`

```yaml
version: 1

image:
  base: docker.io/library/debian:12-slim
  toolchains:
    - { node: "22" }
    - { python: "3.12" }
    - { go: "1.23" }
    - { rust: "stable" }
  agents:
    - claude
    - opencode
    - gemini
  packages:
    - tmux
    - zsh
    - neovim
    - ripgrep
    - fzf
    - direnv
    - mise

box:
  name: komora-box
  resources:
    memoryMib: 8192
    cpus: 4
    diskGib: 64

  personalLayer:
    # Pick ONE of the two forms below.
    volume: { name: personal-layer, mount: /home/komora/.local }
    # mount:  { host: ~/dotfiles/komora, guest: /home/komora/.local }

  volumes:
    - { name: claude-home,    mount: /home/komora/.claude }
    - { name: opencode-home,  mount: /home/komora/.opencode }
    - { name: gemini-home,    mount: /home/komora/.gemini }

  mounts:
    - { host: ~/Projects,         guest: /home/komora/Projects }
    - { host: ~/.config/git,      guest: /home/komora/.config/git, readonly: true }

  ports:
    - { host: 2222, guest: 22 }       # sshd
    - { host: 6080, guest: 6080 }     # optional VNC/web display

  network:
    policy: nonlocal
    denyDomainSuffix: []
    tlsIntercept: false

  ssh:
    enabled: true
    user: komora
    authorizedKeysFromHost: ~/.ssh/id_ed25519.pub

  identity:
    forwardSshAgent: true             # SSH_AUTH_SOCK from host

  features:
    docker: false                     # dockerd-in-VM
    clipboard: true                   # bidirectional clipboard sync

secrets:
  workload:
    - { name: ANTHROPIC_API_KEY, domain: api.anthropic.com }
    - { name: OPENAI_API_KEY,    domain: api.openai.com }
    - { name: GITHUB_TOKEN,      domain: api.github.com }
  identity:
    - ssh-agent                       # forwarded, not injected
```

### 5.2 Validation

- AJV schema rejects unknown keys (forces explicit additions).
- Volume names must be lowercase alphanumeric with hyphens.
- Each `workload` secret must declare a `domain` (enforces the principle that workload secrets only materialize for one outbound destination).
- `mounts[].host` paths are resolved to absolute paths. At `rebuild` time, missing paths emit a warning and are skipped rather than failing the whole operation.

---

## 6. Flows

### 6.1 First time

```
komora bake                  # 5–15 min: build base image, install agents/toolchains, snapshot
komora rebuild               # ~30s: create VM from snapshot, attach volumes/mounts/ports
komora ssh                   # interactive shell; tmux, agents, projects all available
```

### 6.2 Day-to-day

```
komora ssh                   # connect; or VS Code Remote / mosh against the forwarded port
# inside the box: tmux, claude, opencode, edit ~/Projects/*, push code, etc.
```

### 6.3 Rebuild (one command)

```
komora rebuild
```

- Stops and removes the current VM.
- Recreates it from the current base snapshot + manifest.
- Reattaches the personal-layer volume → tmux/shell/nvim/sshd-host-key all return.
- Reattaches per-agent home volumes → agent auth state preserved.
- Reattaches bind-mounted project directories.
- **Nothing the user cares about is on the VM's ephemeral disk**, by design.

### 6.4 Adding a toolchain or agent

```
# edit box.yaml: add agent / toolchain
komora bake                  # rebuilds base image
komora rebuild               # adopts new image
```

### 6.5 Secret rotation

```
komora secret set ANTHROPIC_API_KEY     # prompts; writes to host keychain
komora rebuild                          # or: `komora down && komora up` to re-inject
```

Workload secrets are read from the keychain at `up` time and passed to `msb` via `secretEnv` with their declared domain. The real value never appears in `box.yaml` and never enters the VM's environment in plaintext form.

### 6.6 Identity secrets (SSH key, git signing)

The user's SSH agent socket is forwarded from host into the VM (`SSH_AUTH_SOCK` set inside the box, pointing to a socket file proxied from the host agent). The VM can sign and authenticate as the user, but cannot read the private key bytes. Same channel used for `git push`.

---

## 7. Error handling

- **Schema errors** at `box.yaml` load — fail fast with a clear pointer to the offending key.
- **Missing secrets** at `up` time — workload secrets that aren't in the keychain are logged and skipped (agent will see a placeholder env var; consistent with current behavior). User can `komora secret list` to audit.
- **msb daemon unreachable** — `komora status` surfaces this; commands fail with the underlying msb error verbatim plus a hint to check the daemon is running.
- **sshd not ready after `up`** — `komora ssh` waits up to 30s with a backoff probe; falls back to suggesting `komora attach`.
- **Bake failure** — base image snapshot is not overwritten until the new one succeeds. Previous snapshot stays bootable.
- **Rebuild failure** — old VM is removed only after the new VM passes a readiness probe; on failure, old VM is restarted.
- **Bind-mount path missing on host** — at `rebuild` time, warn and skip; don't fail the whole rebuild. Allows the manifest to be portable across hosts where some project dirs don't exist.

---

## 8. Testing

| Layer | Strategy |
|---|---|
| Manifest resolver | Pure functions; table-driven unit tests (vitest) against fixture `box.yaml` files |
| Secret tiering | Unit tests for classification + injection mapping |
| Backend (msb) | Thin shell; tested via integration tests that spawn a real `msb` against a throwaway sandbox name |
| Commands | End-to-end smoke test: `bake → rebuild → ssh → exec` against a minimal manifest in CI |

The integration tests reuse the existing `tests/` scaffolding. v2 tests for the per-workspace model are deleted along with the code they cover.

---

## 9. Out of scope (for v1)

| Item | Reason |
|---|---|
| GPU passthrough | microsandbox doesn't support it yet |
| Live (memory) snapshots | microsandbox snapshots are disk-only in 0.4.6 |
| Host-side credential proxy daemon | Tiered model (workload `secretEnv` + identity SSH-agent forwarding) handles the common cases; daemon is a v2 escalation if needed |
| GUI installer / TUI | CLI is the surface |
| Backwards compatibility with v2 manifests | Hard pivot — old `komora.config.yaml` files are not read |
| Multi-host targeting | Single host only in v1; selecting between multiple `msb` daemons is deferred |
| GUI / X11 / Wayland forwarding | Only if microsandbox adds a display channel; not in v1 unless that surfaces |

---

## 10. Migration

There is no automated migration from v2. The user:

1. Notes the names of any v2 `*-home` volumes containing auth state they want to keep.
2. Writes a `box.yaml` listing those volumes under `box.volumes` so `rebuild` reattaches them.
3. Runs `komora bake` then `komora rebuild`.

v2 sandboxes can be removed afterwards with `msb rm` directly.

---

## 11. Open questions for review

- Personal layer scope: mount it at `/home/komora/.local` (configs only) or at the entire `$HOME` (configs + cached state + shell history)? Wider scope = more survives, but bigger volume and more chance of stale state.
- Bake granularity: one base image with all declared agents, or one base image per agent set? V1 design assumes one — simpler, slower bake.
- sshd: run as PID 1 init in the box, or as a normal service launched by the box's init? Affects how cleanly `komora down` shuts things.
- Clipboard sync mechanism: which package/protocol (e.g. `lemonade`, `clip-share`, custom over ssh)?
- Multi-host support is explicitly deferred. Resurfacing it later will require a small addition to `box.yaml` for daemon endpoint selection, but no architectural change.
