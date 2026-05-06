# Komora V2 Design

## Summary

`komora` is a thin CLI wrapper around [microsandbox](https://microsandbox.dev) that gives AI coding agents isolated execution environments — one microVM per workspace per agent.

V2 inverts the V1 model. The **agent** (claude, opencode, etc.) is the base image, chosen at invocation time. The **project config** (`komora.config.yaml`) declares toolchain, secrets, network policy, and environment — workspace concerns only. There are no profiles.

Base images come from Docker's public [`docker/sandbox-templates`](https://hub.docker.com/r/docker/sandbox-templates) registry. All agents use the `-docker` variants (DinD enabled). microsandbox pulls and runs them as standard OCI images.

Running `komora run claude` inside a project folder should feel identical to running `claude` directly — same PTY, same signals, same exit code — but everything happens inside a microVM.

## Goals

- Zero-config quick start: `komora run claude` works with no config file.
- Agent choice at invocation, not in config. Same workspace can run different agents.
- Built-in toolchain catalog for common languages, shell escape hatch for everything else.
- Simple secrets store with no policy ceremony.
- Network egress control via domain allowlisting.
- DinD by default in every sandbox.

## Non-Goals

- No host-side credential proxy (V3).
- No team collaboration features.
- No GUI / TUI; CLI only.
- No built-in MCP projection — startup scripts or DinD handle MCP servers.
- No image versioning / digest pinning (V3).
- No devcontainer features compatibility (V3).

## Core Model

`workspace + agent + CLI flags` resolves to a single named sandbox. `komora.config.yaml` provides workspace-specific additions (toolchain, secrets, network, env, mounts).

- **Agent** — the AI coding tool to run. Chosen via `komora run <agent>`. Komora ships a built-in registry mapping agent names to Docker sandbox template images and sensible defaults.
- **Workspace** — the current project directory. Bind-mounted into the sandbox at `/workspace` automatically.
- **Toolchain** — language runtimes installed on top of the agent base image at sandbox creation. Six built-in recipes; custom shell commands for the long tail.
- **Secrets** — name/value pairs in a local store, injected as environment variables.
- **Network** — optional domain allowlist controlling sandbox egress.

### Sandbox Naming

Deterministic: `{workspace-slug}-{agent}`. The workspace slug is the last path segment of the workspace directory.

Example: `~/Projects/komora` running claude → `komora-claude`.

`--name <override>` replaces the entire slug. This is the only way to run two independent sandboxes for the same agent in the same workspace.

## Agent Registry

Each agent definition is built into komora as a TypeScript module at `src/agents/<name>.ts`. Fields:

| Field | Type | Example (claude) |
|---|---|---|
| `template` | string | `docker/sandbox-templates:claude-code-docker` |
| `command` | string | `claude` |
| `authVolumes` | mount[] | `[{ name: "claude-auth", target: "/home/agent/.claude" }]` |
| `defaultSecrets` | string[] | `["ANTHROPIC_API_KEY"]` |
| `defaultDomains` | string[] | `["api.anthropic.com", "auth.anthropic.com"]` |

### Shipped Agents

| Agent | Template Tag | Command |
|---|---|---|
| `claude` | `claude-code-docker` | `claude` |
| `opencode` | `opencode-docker` | `opencode` |
| `codex` | `codex-docker` | `codex` |
| `gemini` | `gemini-docker` | `gemini` |
| `copilot` | `copilot-docker` | `copilot` |
| `shell` | `shell-docker` | `bash` |

### User-Defined Agents

`~/.config/komora/agents/<name>.yaml` for custom agents:

```yaml
name: cursor
template: docker/sandbox-templates:cursor-agent-docker
command: cursor-agent
authVolumes:
  - name: cursor-auth
    target: /home/agent/.cursor
defaultSecrets:
  - CURSOR_API_KEY
defaultDomains:
  - api.cursor.com
```

Discovery: user-defined agents override built-in agents of the same name.

## Repo Config

`komora.config.yaml` lives at the project root. It is optional — `komora run claude` works without one. It declares workspace-specific concerns only.

```yaml
# yaml-language-server: $schema=https://komora.dev/schema/v2.json

toolchain:
  - node: "22"
  - rust: "stable"

setup:
  - cargo install sccache

env:
  NUGET_SOURCE: https://nuget.example.com

mounts:
  - source: ./data
    target: /workspace/data

secrets:
  - GITHUB_TOKEN
  - NUGET_API_KEY

network:
  allowedDomains:
    - github.com
    - api.github.com
    - registry.npmjs.org
  serviceDomains:
    api.github.com: GITHUB_TOKEN
    registry.npmjs.org: NPM_TOKEN

raw:
  cpus: 4
  memory: 4096
```

### Fields

| Field | Type | Description |
|---|---|---|
| `toolchain` | list of `{name: version}` | Built-in recipes to install at creation |
| `setup` | list of strings | Shell commands run after toolchain install |
| `env` | key-value map | Environment variables |
| `mounts` | list of mount specs | Additional bind/volume mounts |
| `secrets` | list of strings | Secret names to inject from store |
| `network` | object | Egress control (see [Network](#network)) |
| `raw` | object | Passthrough to microsandbox config |

### Merge Semantics

Agent defaults always apply. Config adds on top. Specifics:

| Field | Merge behavior |
|---|---|
| `env` | Merged; config wins on conflict |
| `mounts` | Config appended to agent defaults |
| `secrets` | Config appended to agent `defaultSecrets` |
| `network.allowedDomains` | Config appended to agent `defaultDomains` |
| `raw` | Error on conflict with komora-modeled fields |

`--bare` strips all agent defaults (auth volumes, default secrets, default domains, default env). Only the base image and workspace bind-mount remain.

### JSON Schema

Published at `https://komora.dev/schema/v2.json`. The `# yaml-language-server:` header gives editor IntelliSense.

## Toolchain Catalog

Six built-in recipes shipped as `src/toolchains/<name>.sh`. Each is a standalone shell script that receives the version string as `$1`. Recipes assume Debian/Ubuntu base (which Docker's sandbox templates are).

| Name | Installs via | Version examples |
|---|---|---|
| `node` | `fnm` or direct download | `"20"`, `"22"`, `"lts"` |
| `bun` | Official installer | `"1"`, `"latest"` |
| `python` | `pyenv` or deadsnakes PPA | `"3.12"`, `"3.13"` |
| `go` | Official tarball | `"1.22"`, `"1.23"` |
| `rust` | `rustup` | `"stable"`, `"nightly"`, `"1.80"` |
| `dotnet` | Microsoft packages | `"8.0"`, `"9.0"` |

### Execution Order at Sandbox Creation

1. Pull agent template image via `msb pull`
2. Create sandbox via microsandbox SDK
3. Apply mounts: workspace bind, agent auth volumes, config mounts
4. Inject secrets + env vars
5. Apply DNS workaround (drop IPv6 ULA nameserver — see [IPv6 DNS Caveat](#ipv6-dns-caveat))
6. Start `dockerd` (all templates are DinD variants)
7. Run toolchain recipes in declared order
8. Run `setup:` commands in declared order
9. Sandbox ready — `komora run` execs the agent command

Toolchain and setup run once at creation. They do not re-run on `komora start` (sandbox filesystem persists across stop/start). Only `komora rm` + fresh `komora run` re-triggers installation.

Adding a new recipe is dropping a file in `src/toolchains/` — no TypeScript changes needed. Recipes are discovered by filename convention: `src/toolchains/<name>.sh` maps to `toolchain: [{<name>: "<version>"}]` in config. An unknown toolchain name is a config validation error.

## Secrets

### Storage

- File: `~/.config/komora/secrets.json`
- Mode: `0600`
- Format: plaintext JSON `{ "<name>": "<value>" }`
- No encryption at rest. File permissions protect against other local users.

### CLI

```
komora secrets set <name>              # interactive, no-echo prompt
komora secrets set <name> --from-stdin # pipe-friendly
komora secrets list                    # names only, never values
komora secrets rm <name>
```

### Injection

- Agent registry declares `defaultSecrets` — injected if present in store.
- `komora.config.yaml` `secrets:` adds project-specific names — also injected if present in store.
- `serviceDomains` values are also injected as env vars in V2 (upgraded to proxy-based injection in V3). If a secret appears in both `secrets:` and `serviceDomains`, it is injected once (deduplicated).
- Missing secrets silently skipped (not an error).
- All injected as plain environment variables at sandbox creation.

### What Changed from V1

- `hosts` per-secret field — dropped.
- `requireTls` — dropped.
- `onViolation` — dropped.
- Profile-level `secrets.allowed` gating — dropped (no profiles).

## Agent Authentication

Subscription-based agents (Claude, etc.) authenticate interactively inside the sandbox via OAuth on first run.

- Auth tokens persist in named volumes declared in the agent registry (`authVolumes`). For claude: volume `claude-auth` at `/home/agent/.claude`.
- Tokens survive `komora stop` / `komora start`. Lost on `komora rm` (re-auth required).
- `--bare` skips auth volumes — fully ephemeral, re-auth every time.
- Host `~/.claude` is **never** mounted into the sandbox. This matches Docker sbx's security model.
- Host-side credential proxy deferred to V3.

## Network

### Domain Allowlisting

Optional. If `network:` is present in config, the sandbox gets egress restrictions.

```yaml
network:
  allowedDomains:
    - github.com
    - api.github.com
    - registry.npmjs.org
```

- Only listed domains (plus agent `defaultDomains`, plus `serviceDomains` keys) are reachable from the sandbox.
- If `network:` is absent, no restriction — full egress.
- If `network:` is present but `allowedDomains` is empty or omitted, the allowlist is populated from `serviceDomains` keys + agent `defaultDomains` only.
- Implementation: microsandbox network config or iptables rules in the init sequence. Exact mechanism determined during implementation.
- `--bare` strips agent `defaultDomains` — only config-declared domains (from `allowedDomains` and `serviceDomains` keys) apply.

### Service Domains

Maps a domain to a secret name. In V2, entries are automatically added to `allowedDomains` and the corresponding secret is injected as an env var (same as regular secrets).

```yaml
network:
  serviceDomains:
    api.github.com: GITHUB_TOKEN
    registry.npmjs.org: NPM_TOKEN
```

In V3, this upgrades to proxy-based injection: raw secret values stay on the host, a local proxy substitutes them on outbound HTTPS requests. The config shape is forward-compatible — users write `serviceDomains` once, behavior improves transparently.

## Lifecycle Commands

| Command | Behavior |
|---|---|
| `komora run <agent> [-- <args>]` | Find-or-create sandbox, start if stopped, exec agent process. |
| `komora run <agent> --bare [-- <args>]` | Same but strips agent defaults. |
| `komora run <agent> --dry-run` | Print resolved config without creating anything. |
| `komora create <agent>` | Create sandbox + run toolchain/setup. No agent process. |
| `komora start <name>` | Start a stopped sandbox. |
| `komora exec <name> <cmd>` | Run command in running sandbox. Strict: errors if not running. |
| `komora stop <name>` | Stop sandbox. State preserved. |
| `komora rm <name>` | Remove sandbox + volumes. Bind mounts untouched. Auto-stops first. |
| `komora ls` | List sandboxes (running/stopped). |
| `komora logs <name>` | Stream agent stderr. |
| `komora secrets set\|list\|rm` | Manage secret store. |

### Concurrency

1. **Second `komora run claude` while sandbox is running:** Spawns a new agent process in the existing sandbox. No recreation. Equivalent to opening a second terminal.

2. **Race on first concurrent invocation:** `flock`-style file lock at `~/.local/state/komora/locks/{workspace-slug}-{agent}.lock`. Guards `lookup → create-if-missing → start` sequence. Released after sandbox is registered, not held for agent lifetime.

### Lifecycle State Machine

```
(not exists) --[create/run]--> stopped --[start/run]--> running
                                  ^                        |
                                  |-------[stop]-----------|

running --[rm]--> (not exists)
stopped --[rm]--> (not exists)
```

## Observability & Signals

- **Logging:** stderr only. No log files. `komora logs <name>` is a passthrough.
- **Exit codes:** verbatim from the in-sandbox agent.
- **PTY:** allocated when controlling terminal is TTY. `SIGINT` (Ctrl-C) forwarded to agent. `SIGWINCH` forwarded for TUI reflow.
- **Signal handling:** komora catches signals for cleanup (lockfile release) only after the agent exits. It does not intercept signals destined for the agent.

## Runtime: microsandbox

### No abstraction layer

microsandbox is the sole runtime. SDK preferred for lifecycle operations; `msb` CLI as fallback where SDK has gaps. No `sbx` dependency, no Docker Desktop requirement.

### Docker Sandbox Template Compatibility

Agent registry maps to `docker/sandbox-templates:*-docker` tags. These are standard OCI images pulled via `msb pull`.

**Validated:** DinD works inside microsandbox — `dockerd` starts, overlayfs storage driver, cgroup v2, no `--privileged` needed (see `docs/spike-dind-feasibility.md`).

**Implementation gate:** Validation spike must confirm `docker/sandbox-templates:claude-code-docker` specifically boots correctly under `msb run`:
1. `claude` binary on PATH
2. `dockerd` starts and accepts commands
3. `agent` user exists with expected home dir
4. Workspace bind-mount works at `/workspace`

If the template's entrypoint assumes sbx-specific init, override the entrypoint in microsandbox. This is the highest-risk item.

### IPv6 DNS Caveat

microsandbox injects an IPv6 ULA nameserver (`fd42::/16`) that causes inner-Docker image pulls to timeout. Mitigation: patch `/etc/resolv.conf` at startup to drop the `fd42::` line. This runs as part of the init sequence (step 5), not user config.

### User Model

Docker's sandbox templates use a non-root `agent` user with `sudo`:
- Toolchain recipes install as `root`, switch back to `agent`.
- Auth volumes mount at `/home/agent/.claude`, not `/root/.claude`.
- Cache volumes target `/home/agent/.npm`, `/home/agent/.cargo`, etc.

## Implementation Notes

- **Language:** TypeScript. CLI distributed as npm package.
- **microsandbox interface:** SDK for lifecycle; `msb` CLI fallback.
- **Lock library:** `proper-lockfile` or equivalent.
- **Config validation:** JSON Schema via AJV at load time.
- **Agent registry:** `src/agents/<name>.ts`, one file per agent.
- **Toolchain recipes:** `src/toolchains/<name>.sh`, one file per recipe.
- **User agents:** `~/.config/komora/agents/<name>.yaml`.

## Breaking Changes from V1

| V1 | V2 |
|---|---|
| `profile:` concept | Eliminated |
| `agent:` in `komora.config.yaml` | Agent is a CLI argument |
| Profile discovery chain (repo/user/built-in) | Replaced by agent registry |
| `komora config show` | Replaced by `--dry-run` |
| Secret policy fields (`hosts`, `requireTls`, `onViolation`) | Dropped |
| Image convention `komora/{agent}-{profile}` | `docker/sandbox-templates:{agent}-docker` |
| Sandbox naming `{workspace}-{agent}-{profile}` | `{workspace}-{agent}` |
| Built-in profile YAML files | Agent registry in code + toolchain scripts |

## Deferred to V3+

- Host-side credential proxy (proxy-based secret injection for `serviceDomains`).
- OS keychain integration for secret store.
- Image digest / version pinning.
- First-class `mcpServers:` config block.
- Snapshot/materialize sandbox as reusable template.
- Devcontainer features compatibility.

## References

- [Docker AI Sandboxes (`sbx`) — UX model](https://docs.docker.com/ai/sandboxes/usage/)
- [Docker Sandbox Templates](https://docs.docker.com/ai/sandboxes/customize/templates/)
- [Docker Sandbox Kits — V3 proxy reference](https://docs.docker.com/ai/sandboxes/customize/kits/)
- [docker/sandbox-templates on Docker Hub](https://hub.docker.com/r/docker/sandbox-templates)
- [microsandbox documentation](https://docs.microsandbox.dev)
- [DinD Feasibility Spike](../spike-dind-feasibility.md)
- [Komora V1 Design](2026-04-30-komora-v1-design.md)
