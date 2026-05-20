# komora

A personal dev VM orchestrator built on [microsandbox](https://github.com/microsandbox/microsandbox).

`komora` builds and manages **one persistent microVM** ("the box") that you live in instead of your host. The box has your toolchains, agents (claude, opencode, gemini, copilot, codex), tmux, shell, and editor pre-installed. You ssh into it like a remote machine, but it runs locally — and you can rebuild it from scratch with one command without losing anything you care about.

## Why

- **Isolate AI coding agents.** Agents can install, modify, and run code freely inside the box without touching your host filesystem, your SSH keys, or your cloud credentials.
- **Tiered secrets.** Workload secrets (API keys) are injected via microsandbox `secretEnv` — the real value is materialized only for outbound requests to a specific declared domain. Identity secrets (your SSH key) never enter the box; instead, your `SSH_AUTH_SOCK` is forwarded.
- **Reproducible by design.** Anything not on a declared volume or bind-mount is lost on rebuild. That discipline keeps the box honest.

## Install

```bash
npm install -g komora
```

Requires Node ≥22 and a running [microsandbox](https://github.com/microsandbox/microsandbox) daemon.

## Quick start

1. Write `~/.config/komora/box.yaml` (see `docs/design/2026-05-19-personal-dev-box-design.md` for the full schema).
2. Bake the base image (one time, slow):
   ```bash
   komora bake
   ```
3. Rebuild the VM (fast):
   ```bash
   komora rebuild
   ```
4. Connect:
   ```bash
   komora ssh
   ```

## Commands

| Command | What it does |
|---|---|
| `komora bake` | Build/refresh the base image snapshot |
| `komora rebuild` | Recreate the VM from the base snapshot + manifest |
| `komora up` / `down` | Start / stop the VM |
| `komora pause` / `resume` | Pause / resume |
| `komora destroy` | Remove the VM (volumes preserved) |
| `komora ssh` | Connect via sshd |
| `komora attach` | Fallback: `msb exec -t bash` |
| `komora status` | Show VM state, sshd readiness |
| `komora logs` | Tail VM logs |
| `komora secret set/list/rm` | Manage host-side secrets |

## Architecture

See `docs/design/2026-05-19-personal-dev-box-design.md`.

## License

MIT
