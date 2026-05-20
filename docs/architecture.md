# komora Architecture

> This document supersedes the archived design doc at
> `docs/design/2026-05-19-personal-dev-box-design.md`.

---

## What komora does

`komora` is a TypeScript CLI that builds and manages one persistent personal dev
microVM ("the box") via [microsandbox](https://github.com/microsandbox/microsandbox).
It replaces a prior per-workspace ephemeral sandbox model.

The box is a long-lived VM rooted in a baked base image. Toolchains, agents,
and personal config persist across rebuilds. Secret values are never written to
the manifest — they are injected at start time from an encrypted local store.

---

## The three layers

```
+--------------------------------------------+
|  Personal layer  (persistent volume/mount) |
|  shell rc, tmux, sshd host key, agent state|
+--------------------------------------------+
|  Manifest  (~/.config/komora/box.yaml)     |
|  mounts, volumes, secrets, ports, resources|
+--------------------------------------------+
|  Base image  (microsandbox snapshot)       |
|  distro + toolchains + agents + sshd/tmux  |
+--------------------------------------------+
```

**Base image** — built once by `komora bake`. Contains the OS, every toolchain,
every AI agent, sshd, and tmux. Stored as a microsandbox snapshot and rebuilt
only when the recipe changes.

**Manifest** — a single YAML file at `~/.config/komora/box.yaml`. Declares
runtime concerns only: mounts, volumes, secret names (not values), network
policy, ports, and resource limits.

**Personal layer** — a persistent volume or host bind-mount for everything the
user cares about that lives outside the image: shell rc, tmux config, the sshd
host key, and per-agent state directories. Survives box rebuilds.

---

## Source layout

```
src/
  cli.ts                    -- commander entry point; registers all commands
  box/
    types.ts                -- BoxManifest, ResolvedBox, all shared types
    schema.ts               -- AJV JSON Schema + validateBoxManifest()
    load.ts                 -- reads box.yaml, validates against schema
    resolve.ts              -- expands secrets/volumes, computes ResolvedBox
    index.ts                -- re-exports
    backend/
      msb.ts                -- runMsb(): shells out to the msb CLI
      sdk.ts                -- buildSandbox(): uses `msb create` CLI
      lifecycle.ts          -- up/down/pause/resume/destroy via msb CLI
      image.ts              -- bake: build base image, snapshot it
      rebuild.ts            -- recreate VM from manifest + base snapshot
      ssh.ts                -- sshd readiness probe
      status.ts             -- box status query
  baker/
    recipe.ts               -- assembles the bake recipe from the manifest
    toolchains.ts           -- toolchain install-fragment selector
    agents.ts               -- agent install-fragment selector
    install/                -- shell fragments executed during bake
      node.sh, go.sh, rust.sh, python.sh, bun.sh, dotnet.sh
      mise.sh, sshd.sh, agent-*.sh
  secrets/
    keychain.ts             -- file store at ~/.config/komora/secrets.json (0600), atomic write
    tiers.ts                -- classify(): splits secrets into workload / identity tiers
    inject.ts               -- collectWorkloadValues(), buildSecretEnvArgs()
  commands/
    bake.ts                 -- build base image
    rebuild.ts              -- destroy + recreate VM
    up.ts                   -- start the box, inject secrets
    down.ts                 -- stop the box
    pause.ts                -- suspend the box
    resume.ts               -- resume a suspended box
    destroy.ts              -- remove the VM entirely
    ssh.ts                  -- open an interactive SSH session
    attach.ts               -- attach to the box console
    status.ts               -- print box state
    logs.ts                 -- tail box logs
    secret.ts               -- get/set/delete secret values
  util/
    paths.ts                -- XDG-aware config and state paths
    log.ts                  -- structured logger
```

---

## Key architectural decisions

### msb CLI over NAPI SDK for persistent operations

`Sandbox.builder().createDetached()` and `Sandbox.start()` from the NAPI SDK
carry GC destructors that stop the sandbox roughly 7 seconds after the Node
process moves on. All create/start/stop/remove operations therefore go through
`runMsb()` in `backend/msb.ts`, which shells out to the `msb` CLI (fire-and-
forget). The SDK is used only for short structured calls — snapshot listing,
status queries — where the GC timing is not a problem.

### Secrets never in box.yaml

Workload secret values live in `~/.config/komora/secrets.json` (mode 0600),
not in the manifest. At `komora up` time, `secrets/inject.ts` reads values from
the keychain and passes them to `msb` as `--secret NAME=value@domain` arguments.
Inside the box the environment variable is a placeholder (`$MSB_NAME`); the
real value is substituted only for TLS-intercepted requests to the declared
domain. Identity secrets (SSH agent socket) are forwarded via `SSH_AUTH_SOCK`
rather than injected.

### stdin handling for non-interactive exec

Spawning `msb exec` with `stdio: 'pipe'` blocks waiting for stdin EOF.
Non-interactive spawns use `['ignore', 'pipe', 'pipe']` so the process does
not hang.

### HOME not overridden in tests

`msb` uses `HOME` to locate its global database (`~/.microsandbox/db/msb.db`).
Tests must not override `HOME`. Komora-level isolation in tests uses
`XDG_CONFIG_HOME` and `XDG_STATE_HOME` only.

---

## Main flows

### First-time setup

```sh
komora bake       # 5-15 min: build base image, install toolchains/agents, snapshot
komora rebuild    # ~30 s: create VM from snapshot, attach volumes/mounts/ports
komora ssh        # interactive shell
```

### Rebuild

`komora rebuild` is the normal path after changing the manifest or updating
the base image:

1. Stops and removes the current VM.
2. Recreates from the current base snapshot.
3. Re-attaches the personal-layer volume, per-agent volumes, and bind mounts
   declared in the manifest.
4. Nothing the user cares about is on the ephemeral disk, so no data is lost.

### Secret rotation

```sh
komora secret set ANTHROPIC_API_KEY
komora down && komora up   # re-injects the updated value
```

---

## Data flow: manifest to running box

```
box.yaml
  +-- load.ts --> validateBoxManifest()
       +-- resolve.ts --> ResolvedBox
            +-- backend/lifecycle.ts --> runMsb(up)
            |    +-- secrets/inject.ts --> --secret args
            +-- backend/ssh.ts --> readiness probe
```

`load.ts` reads and schema-validates `box.yaml`. `resolve.ts` expands
references (secrets by name, volume paths) into a `ResolvedBox` that is passed
through the rest of the pipeline. Nothing downstream re-reads the file.

---

## Config and state paths

| Purpose | Default path |
|---|---|
| Box manifest | `~/.config/komora/box.yaml` |
| Secret store | `~/.config/komora/secrets.json` |
| State directory | `~/.local/state/komora/` |

Both directories follow XDG Base Directory conventions; `util/paths.ts`
resolves them, honouring `XDG_CONFIG_HOME` and `XDG_STATE_HOME` overrides.

---

## Out of scope (v1)

- GPU passthrough and live (memory) snapshots
- Host-side credential proxy daemon
- Multi-host targeting
- GUI / X11 / Wayland forwarding
- `komora profile list/delete` (tracked as a known followup)
