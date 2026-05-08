# Architecture

## High-level model

```
workspace dir + komora.config.yaml
        +
agent (claude | opencode | gemini | copilot | codex)
        +
profile (optional: work | personal | ...)
        |
        v
ResolvedConfig --> microsandbox microVM (sandbox)
```

A sandbox is a microsandbox microVM identified by a name derived from the workspace, agent, and optional profile. Each agent runs inside the sandbox as a process. Multiple `komora run` invocations against the same sandbox start new agent processes inside the existing sandbox without recreating it.

---

## Agent registry

Each agent is defined in `src/agents/<name>.ts` and exports an `AgentDefinition`.

### `AgentDefinition` fields

| Field | Type | Description |
|---|---|---|
| `template` | string | Docker sandbox template tag |
| `command` | string | Binary to exec inside sandbox |
| `defaultArgs` | string[] | CLI args passed to command |
| `authVolumes` | `{name, mountPath}[]` | Named volumes for credential persistence |
| `defaultSecrets` | string[] | Secret names injected from store if present |
| `defaultDomains` | string[] | Always-allowed egress domains |
| `memoryMib` | number? | Memory cap |
| `cpus` | number? | CPU cap |

### Built-in agents

| Agent | Template | Auth volumes |
|---|---|---|
| `claude` | `docker/sandbox-templates:claude-code-docker` | `claude-home` at `/home/agent/.claude`, `claude-dotfile` at `/home/agent/.claude.json` |
| `opencode` | `docker/sandbox-templates:opencode-docker` | `opencode-home` |
| `gemini` | `docker/sandbox-templates:gemini-docker` | `gemini-home` |
| `copilot` | `docker/sandbox-templates:copilot-docker` | `copilot-home` |
| `codex` | `docker/sandbox-templates:codex-docker` | `codex-home` |

All agents use `*-home` volume naming (not `*-auth`). Claude has a second volume `claude-dotfile` to persist onboarding state across recreations.

### User-defined agents

Custom agent definitions can be placed at `~/.config/komora/agents/<name>.yaml`. They override built-in agents of the same name.

---

## Credential profiles

A profile isolates both auth volumes and sandbox name for an agent. This allows multiple independent auth contexts (e.g. work and personal accounts) for the same agent on the same machine.

### Activation

Priority order (highest wins):
1. `--profile <name>` CLI flag on `run` or `create`
2. `profile:` field in `komora.config.yaml`
3. No profile (default)

### Naming conventions

Profile names must match `^[a-z0-9]+(-[a-z0-9]+)*$` — lowercase alphanumeric with hyphens, no leading/trailing hyphens.

### Effect on volume names

Without profile: `claude-home`, `claude-dotfile`
With `--profile work`: `claude-home-work`, `claude-dotfile-work`

Profiles are agent-scoped: `work` for claude and `work` for opencode are independent credential sets.

### Lifecycle

Profiles are created implicitly on first use. Volumes are auto-created by the microsandbox SDK when a sandbox is first started.

---

## Config file (`komora.config.yaml`)

Optional file at the workspace root.

| Field | Type | Description |
|---|---|---|
| `toolchain` | `{name: version}[]` | Built-in toolchain recipes to install |
| `setup` | string[] | Shell commands run after toolchain install |
| `env` | `{key: value}` | Environment variables injected into sandbox |
| `mounts` | mount[] | Additional bind or volume mounts |
| `secrets` | string[] | Secret names to inject from store |
| `network.allowedDomains` | string[] | Egress domain allowlist |
| `network.serviceDomains` | `{domain: secretName}` | Domain → secret: domain added to allowlist, secret injected |
| `raw` | object | Passthrough to microsandbox SDK (no overlap with modeled fields) |
| `profile` | string | Default credential profile for this workspace |

### Merge semantics

- `secrets` and `allowedDomains` are deduplicated unions of agent defaults and config values
- `serviceDomains` contributes both to `allowedDomains` (keys) and `secrets` (values)
- `--profile` CLI flag overrides config `profile` field
- `--bare` strips all agent defaults (authVolumes, defaultSecrets, defaultDomains); only the workspace bind-mount remains

---

## Sandbox naming

Computed by `sandboxName()` in `src/sandbox/naming.ts`.

| Case | Name pattern | Example |
|---|---|---|
| Default | `{workspace-slug}-{agent}` | `komora-claude` |
| With profile | `{workspace-slug}-{agent}-{profile}` | `komora-claude-work` |
| `--name <override>` | `{override}` (verbatim) | `my-sandbox` |

The workspace slug is derived from the workspace directory name.

---

## Config resolution pipeline

Entry point: `loadResolvedConfig()` in `src/config/index.ts`.

1. Read `komora.config.yaml` from workspace dir (optional; missing = empty config)
2. Validate YAML against JSON Schema (AJV) in `src/config/schema.ts`
3. Load agent definition from registry (`src/agents/<name>.ts`)
4. Resolve profile: CLI flag > config `profile` field > none
5. Validate profile name regex if set
6. Call `resolveConfig()` (`src/config/resolve.ts`):
   - Apply profile suffix to authVolume names
   - Compute sandbox name via `sandboxName()`
   - Merge and deduplicate secrets
   - Merge and deduplicate allowedDomains
   - Expand serviceDomains into allowedDomains + secrets
   - Produce `ResolvedConfig`

### Key types (`src/config/types.ts`)

- `AgentDefinition` — static agent descriptor (see registry section)
- `RepoConfig` — parsed `komora.config.yaml`
- `ResolvedConfig` — merged, validated, ready-to-use config passed to lifecycle functions
- `Mount` — bind or volume mount descriptor
- `NetworkConfig` — `{allowedDomains, serviceDomains}`

---

## Lifecycle model

Implemented in `src/sandbox/lifecycle.ts` (microsandbox SDK) with `src/sandbox/msb.ts` as CLI fallback.

### `komora run`

1. Acquire flock-style lock at `~/.local/state/komora/locks/{name}.lock`
2. If sandbox does not exist: create it (apply template, mounts, env, network)
3. If sandbox is not running: start it
4. Release lock
5. Exec agent command inside sandbox (long-running process)

A second `komora run` against the same sandbox while it is already running skips create/start and execs a new agent process in the existing sandbox.

### Other commands

| Command | File | Description |
|---|---|---|
| `create` | `src/commands/create.ts` | Create sandbox without starting |
| `start` | `src/commands/start.ts` | Start a created sandbox |
| `stop` | `src/commands/stop.ts` | Stop sandbox (preserves volumes) |
| `rm` | `src/commands/rm.ts` | Remove sandbox |
| `exec` | `src/commands/exec.ts` | Exec arbitrary command in sandbox |
| `ls` | `src/commands/ls.ts` | List sandboxes |
| `logs` | `src/commands/logs.ts` | Fetch sandbox logs |
| `secrets` | `src/commands/secrets.ts` | Manage secrets store |

### Concurrency

The lock at `~/.local/state/komora/locks/{name}.lock` guards the create/start sequence against races (e.g. two concurrent `komora run` invocations). The lock is released after the sandbox is started, not held for the agent's lifetime.

---

## Secrets store

- Location: `~/.config/komora/secrets.json`
- File mode: `0600`
- Managed via `komora secrets` subcommand
- Secrets are injected as environment variables into the sandbox at start time
- Missing secrets are silently skipped at injection time (no error)

---

## Toolchain recipes

Shell scripts in `src/toolchains/` install language runtimes inside the sandbox.

| Script | Runtime |
|---|---|
| `node.sh` | Node.js |
| `bun.sh` | Bun |
| `python.sh` | Python |
| `go.sh` | Go |
| `rust.sh` | Rust |
| `dotnet.sh` | .NET |

Specified in `komora.config.yaml` as:

```yaml
toolchain:
  - node: "20"
  - python: "3.12"
```

Toolchain scripts run before `setup` commands.
