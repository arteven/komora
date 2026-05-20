# komora

A personal dev VM orchestrator built on [microsandbox](https://github.com/superradcompany/microsandbox).

`komora` builds and manages **one persistent microVM** ("the box") that you live in instead of your host. The box has your toolchains, AI coding agents (claude, opencode, gemini, codex, copilot), tmux, shell, and editor pre-installed. You SSH into it like a remote machine, but it runs locally — and you can rebuild it from scratch with one command without losing anything you care about.

## Why

- **Isolate AI coding agents.** Agents can install, modify, and run code freely inside the box without touching your host filesystem, SSH keys, or cloud credentials.
- **Tiered secrets.** Workload secrets (API keys) are injected via microsandbox `secretEnv` — the real value is materialized only for outbound requests to a declared domain. Identity secrets (your SSH key) never enter the box; your `SSH_AUTH_SOCK` is forwarded instead.
- **Reproducible by design.** Anything not on a declared volume or bind-mount is lost on rebuild. That discipline keeps the box honest.

## Install

```bash
npm install -g komora
```

Requires Node ≥ 22 and a running [microsandbox](https://github.com/superradcompany/microsandbox) daemon (`msb` on PATH).

## Quick start

1. Write `~/.config/komora/box.yaml`:

```yaml
version: 1

image:
  base: docker.io/library/debian:12-slim
  toolchains:
    - { node: "22" }
    - { python: "3.12" }
  agents:
    - claude
  packages:
    - tmux
    - zsh
    - neovim

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
  identity:
    forwardSshAgent: true

secrets:
  workload:
    - { name: ANTHROPIC_API_KEY, domain: api.anthropic.com }
  identity:
    - ssh-agent
```

2. Bake the base image (once, 5–15 min):
```bash
komora bake
```

3. Create the VM (~30s):
```bash
komora rebuild
```

4. Connect:
```bash
komora ssh
```

See [`docs/quickstart.md`](docs/quickstart.md) for a detailed walkthrough.

## Commands

| Command | What it does |
|---|---|
| `komora bake` | Build/refresh the base image snapshot |
| `komora rebuild` | Recreate the VM from base snapshot + manifest |
| `komora up` / `down` | Start / stop the VM |
| `komora pause` / `resume` | Pause / resume (not yet implemented in microsandbox) |
| `komora destroy` | Remove the VM (volumes preserved) |
| `komora ssh` | Connect via sshd |
| `komora attach` | Fallback: `msb exec -t bash` |
| `komora status` | Show VM state, sshd readiness |
| `komora logs` | Tail VM logs |
| `komora secret set/list/rm` | Manage host-side secrets |

## Managing secrets

```bash
komora secret set ANTHROPIC_API_KEY   # prompts; stores in ~/.config/komora/secrets.json
komora secret list
komora secret rm ANTHROPIC_API_KEY
```

After changing a secret: `komora down && komora up` (or `komora rebuild`) to re-inject.

See [`docs/secrets.md`](docs/secrets.md) for the full tiered secrets model.

## Documentation

| Doc | What it covers |
|---|---|
| [`docs/quickstart.md`](docs/quickstart.md) | Step-by-step install and first run |
| [`docs/architecture.md`](docs/architecture.md) | System design, source layout, key decisions |
| [`docs/box-yaml-reference.md`](docs/box-yaml-reference.md) | All `box.yaml` fields with types and defaults |
| [`docs/secrets.md`](docs/secrets.md) | Tiered secrets model — workload vs identity |
| [`docs/troubleshooting.md`](docs/troubleshooting.md) | Known issues and fixes |

## License

MIT
