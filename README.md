# komora

Per-workspace microVM sandboxes for AI coding agents — `claude`, `opencode`, anything else with a CLI.

## Quick start

```bash
# from the root of any project
echo 'agent: claude
profile: nodejs' > komora.config.yaml

komora secrets set GITHUB_TOKEN
komora run claude
```

## Editor IntelliSense

Add this header to `komora.config.yaml`:

```yaml
# yaml-language-server: $schema=https://komora.dev/schema/v1.json
```

## Commands

| | |
|---|---|
| `komora run <agent> [-- <args>]` | Find-or-create the sandbox and run the agent. |
| `komora create <agent>` | Create a sandbox without running an agent. |
| `komora start <name>` | Start a stopped sandbox. |
| `komora exec <name> <cmd>` | Run a one-off command. Errors if not running. |
| `komora stop <name>` | Stop a running sandbox. |
| `komora rm <name>` | Remove a sandbox (auto-stops first). |
| `komora ls` | List sandboxes. |
| `komora logs <name>` | Stream the agent's stderr. |
| `komora config show <agent>` | Print the resolved config. |
| `komora secrets {set,list,rm}` | Manage stored secrets. |

See `docs/superpowers/specs/2026-04-30-komora-v1-design.md` for the full design.
