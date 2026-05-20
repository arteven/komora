# Quickstart

This guide walks you through installing komora and starting your personal dev box for the first time.

## Prerequisites

- Node.js >= 22
- `msb` CLI on your PATH — install from [microsandbox](https://github.com/microsandbox/microsandbox)
- The microsandbox daemon running (see the microsandbox docs for `msd` setup)

## Installation

```bash
npm install -g komora
```

## First run

### 1. Write your manifest

Create `~/.config/komora/box.yaml`. This is the single source of truth for your box.

```yaml
version: 1

image:
  base: docker.io/library/debian:12-slim
  toolchains:
    - { node: "22" }
  agents:
    - claude
  packages:
    - tmux
    - zsh

box:
  name: my-box
  personalLayer:
    volume: { name: personal-layer, mount: /home/komora/.local }
  ports:
    - { host: 2222, guest: 22 }
  ssh:
    enabled: true
    user: komora
    authorizedKeysFromHost: ~/.ssh/id_ed25519.pub

secrets:
  workload:
    - { name: ANTHROPIC_API_KEY, domain: api.anthropic.com }
  identity:
    - ssh-agent
```

See [docs/box-yaml-reference.md](box-yaml-reference.md) for the full manifest schema.

### 2. Bake the base image

```bash
komora bake
```

This builds a microsandbox snapshot from your manifest. It takes 5–15 minutes and only needs to run again when you change `image.toolchains`, `image.agents`, or `image.packages`.

### 3. Create the VM

```bash
komora rebuild
```

This creates the VM from the base snapshot and applies your manifest (~30 seconds).

### 4. Connect

```bash
komora ssh
```

You are now inside your box. It runs locally but behaves like a remote machine — run agents, edit code, push to git.

## Day-to-day usage

After the first run, your box persists across reboots.

```bash
komora ssh        # connect via sshd
komora status     # show VM state and sshd readiness
komora logs       # tail VM logs
```

To stop and restart the VM without destroying it:

```bash
komora down
komora up
```

## Adding a toolchain or agent

Edit `~/.config/komora/box.yaml`, then rebuild:

```bash
komora bake      # rebuild the base image with your changes
komora rebuild   # recreate the VM from the new snapshot
```

## Managing secrets

Secrets are stored on the host at `~/.config/komora/secrets.json` and injected into the VM at start time.

```bash
komora secret set ANTHROPIC_API_KEY   # prompts for the value
komora secret list
komora secret rm ANTHROPIC_API_KEY
```

After changing a secret, restart the VM for it to take effect:

```bash
komora down && komora up
```

See [docs/secrets.md](secrets.md) for the full secrets model, including identity forwarding via `SSH_AUTH_SOCK`.

## Command reference

| Command | What it does |
|---|---|
| `komora bake` | Build or refresh the base image snapshot |
| `komora rebuild` | Recreate the VM from base snapshot and manifest |
| `komora up` | Start the VM |
| `komora down` | Stop the VM |
| `komora pause` / `resume` | Pause / resume the VM |
| `komora destroy` | Remove the VM (volumes are preserved) |
| `komora ssh` | Connect via sshd |
| `komora attach` | Fallback shell via `msb exec` |
| `komora status` | Show VM state and sshd readiness |
| `komora logs` | Tail VM logs |
| `komora secret set/list/rm` | Manage host-side secrets |
