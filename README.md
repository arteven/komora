# komora

Per-workspace microVM sandboxes for AI coding agents — `claude`, `opencode`, anything else with a CLI.

## Quick Start

```bash
# Zero-config: boot an agent in an isolated sandbox
komora run claude

# With a project config
# Create komora.config.yaml:
# toolchain:
#   - node: "22"
# secrets:
#   - GITHUB_TOKEN
komora run claude

# Other agents
komora run opencode
komora run shell

# Manage secrets
komora secrets set ANTHROPIC_API_KEY
komora secrets set GITHUB_TOKEN

# Lifecycle
komora ls
komora stop komora-claude
komora start komora-claude
komora rm komora-claude

# Preview resolved config
komora run claude --dry-run

# Strip agent defaults (ephemeral, no auth persistence)
komora run claude --bare

# Credential profiles (isolate auth volumes per account)
komora run claude --profile work
komora run claude --profile personal
```

## Editor IntelliSense

Add this header to `komora.config.yaml`:

```yaml
# yaml-language-server: $schema=https://komora.dev/schema/v2.json
```

## Commands

| | |
|---|---|
| `komora run <agent> [-- <args>]` | Find-or-create the sandbox and run the agent. |
| `komora run <agent> --dry-run` | Print resolved config without creating anything. |
| `komora run <agent> --bare` | Strip agent defaults (auth, secrets, domains). |
| `komora run <agent> --profile <name>` | Isolate credentials to a named profile. |
| `komora create <agent>` | Create a sandbox without running an agent. |
| `komora create <agent> --profile <name>` | Create sandbox with credential profile. |
| `komora start <name>` | Start a stopped sandbox. |
| `komora exec <name> <cmd>` | Run a one-off command. Errors if not running. |
| `komora stop <name>` | Stop a running sandbox. |
| `komora rm <name>` | Remove a sandbox (auto-stops first). |
| `komora ls` | List sandboxes. |
| `komora logs <name>` | Stream the agent's stderr. |
| `komora secrets {set,list,rm}` | Manage stored secrets. |

See `docs/architecture.md` for full technical documentation.
