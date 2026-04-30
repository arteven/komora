# Komora V1 Design

## Summary

`komora` is a thin CLI wrapper around [microsandbox](https://microsandbox.dev) that gives AI coding agents (Claude Code, OpenCode, etc.) reproducible, isolated execution environments — one microVM per workspace, per agent, per profile.

The UX is modeled on Docker's [`sbx` AI Sandboxes](https://docs.docker.com/ai/sandboxes/usage/) command: a `run` that finds-or-creates by name, explicit `start`/`stop`/`rm`, and a strict `exec` that errors when nothing is running. Running `komora run claude` inside a folder should feel as close as possible to running `claude` directly on the host — only with everything happening inside a microVM.

This is a personal sandbox project. Scope is deliberately small. Anything komora does should be conceptually achievable with `msb` directly; komora's job is to add reuse, conventions, and a typed config layer.

## Goals

- Reuse-by-name lifecycle: a sandbox is keyed to `workspace + agent + profile`, and `komora run` reconnects rather than re-creating.
- Profiles as the unit of reuse, with built-in profiles shipped in the package and user/repo overrides.
- Komora-owned secret store (microsandbox has none), with explicit per-secret host policy.
- Native shell composition: verbatim exit codes, PTY-native signals, stderr-only logging.
- YAML config (`komora.config.yaml`), JSON-Schema-validated, with layered discovery.

## Non-Goals

- No built-in MCP-projection primitive — profile startup scripts handle MCP setup. DinD pattern documented.
- No team collaboration features (sharing, syncing, RBAC).
- No image versioning, digest pinning, or private registry support in V1 — schema reserves a `digest:` field for V2.
- No log files; stderr only.
- No GUI / TUI; CLI only.
- No bidirectional MCP-state sync between host and sandbox.

## Core Model

`workspace + agent + profile + secrets + CLI flags` resolves to a single named sandbox.

- **workspace** — the current folder. Identity uses the last path segment as a slug; collisions across same-named folders are accepted by design and resolved via `--name <override>`.
- **agent** — the flavor running inside the sandbox (e.g. `claude`, `opencode`).
- **profile** — environment definition: image, mounts, env, allowed-secrets policy. Reusable across workspaces.
- **secrets** — values stored in `~/.config/komora/secrets.json`, exposed only when a profile's policy permits.
- **CLI flags** — highest-precedence overrides.

### Sandbox Naming

Deterministic name: `<workspace-slug>-<agent>-<profile>`. Example: a workspace at `~/code/foo` running Claude with the `nodejs` profile resolves to `foo-claude-nodejs`.

This is the slug shown in `komora ls`, the key for the workspace lock, and the name passed to `msb`. `--name <override>` replaces the entire slug.

## Lifecycle Commands

V1 ships the full `sbx`-equivalent command set:

| Command | Behavior |
|---|---|
| `komora run <agent> [-- <args>]` | Find-or-create the named sandbox, start it if stopped, attach an agent process. Reconnects to an existing sandbox without re-creating it. |
| `komora create <agent>` | Create the named sandbox without starting an agent. |
| `komora start <name>` | Start a stopped sandbox. |
| `komora exec <name> <cmd>` | Run a command inside a running sandbox. **Strict**: errors if the sandbox is not running. Does not auto-start. Mirrors `sbx exec`. |
| `komora stop <name>` | Stop a running sandbox. Sandbox state preserved. |
| `komora rm <name>` | Remove the sandbox plus its images, containers, and named volumes. Bind mounts (host workspace folder) are never touched. Auto-stops a running sandbox first. |
| `komora ls` | List sandboxes (running and stopped). |
| `komora logs <name>` | Stream stderr from the agent process. No log files; this is a passthrough. |
| `komora config show <agent>` | Print the resolved config for an agent in YAML (default) or JSON (`--json`). Output is the same shape as profile YAML so it can be forked. |
| `komora secrets {set,list,rm}` | Manage the secret store (see [Secrets](#secrets)). |

### Concurrency

Two cases need explicit handling:

1. **Second `komora run` from the same folder while the sandbox is running.**
   Spawn a *new agent process inside the existing microVM*. Do not recreate the VM, do not reject, do not auto-attach to the existing TUI. Conceptually equivalent to opening a second terminal and running `claude` again.

2. **Race on first concurrent invocation.**
   A `flock`-style file lock keyed on the workspace slug guards the `lookup → create-if-missing → spawn agent` sequence. Lock file lives at `~/.local/state/komora/locks/<workspace-slug>-<agent>-<profile>.lock`. Lock is released after the sandbox is registered (not held for the agent's lifetime).

The lockfile is an implementation detail. `komora ls` is the user-facing way to see what's running; lock state is not exposed in V1.

## Profiles

A profile is a YAML file that fully describes an environment:

```yaml
# ~/.config/komora/profiles/nodejs.yaml
name: nodejs
image: komora/nodejs:latest    # OCI tag = {agent}-{profile} for built-ins
env:
  NODE_ENV: development
mounts:
  - type: bind
    source: ${WORKSPACE}
    target: /workspace
  - type: volume
    name: nodejs-cache
    target: /root/.npm
secrets:
  allowed:
    - name: NPM_TOKEN
      hosts: ["registry.npmjs.org"]
      requireTls: true
startup:
  - npm config set registry https://registry.npmjs.org
```

### Discovery Order (highest priority wins)

1. `<repo>/.komora/profiles/<name>.yaml` — repo-local, can be checked in.
2. `~/.config/komora/profiles/<name>.yaml` — user-global.
3. Built-in profiles shipped with the `komora` package under `src/profiles/builtin/`.

A repo-local profile of the same name fully replaces the user-global one. (No deep merge between them — selecting "the same profile" with two definitions would be confusing.)

### Built-in Profiles

V1 ships built-ins in the published `komora` package. Splitting them into a sibling repo is a non-breaking refactor for V2 if cadence ever diverges.

Initial built-ins: `nodejs`, `python`, `kotlin-android`. Exact list finalized at implementation time.

### Image Tag Convention

Tag = `{agent}-{profile}` for built-in profiles (e.g. `komora/claude-nodejs`). No version pinning in V1. OCI multi-arch manifests handle architecture transparently. The schema reserves a `digest:` field for V2 pinning; V1 ignores it with a warning.

## Repo Config

`komora.config.yaml` lives at the repo root and selects + lightly overrides a profile. It does **not** define profiles inline — profiles are first-class files only.

```yaml
# yaml-language-server: $schema=https://komora.dev/schema/v1.json

agent: claude
profile: nodejs

env:
  PROJECT_KEY: foo

secrets:
  allow:
    - GITHUB_TOKEN

raw:
  cpus: 4
  memory: 4096
```

### Override Semantics

- `env:` — merged into the profile's env. Repo-config keys win on conflict.
- `mounts:` — appended to the profile's mounts.
- `secrets.allow:` — opts in to secrets the profile already declares in `secrets.allowed`. Repo config can never introduce a secret the profile did not list; that requires editing (or forking) the profile.
- `raw:` — passed through verbatim to `msb`'s sandbox config. **On conflict with a komora-modeled field, komora errors at config-load time.** No silent overrides.

### Schema

JSON Schema published at a stable URL (e.g. `https://komora.dev/schema/v1.json`). The `# yaml-language-server:` header gives editor IntelliSense without IDE plugins. README documents the header.

## Secrets

Microsandbox does not have a native secret store ([confirmed](https://docs.microsandbox.dev/cli/sandbox-commands.md)), so komora owns one.

### Storage

- File: `~/.config/komora/secrets.json`
- Mode: `0600`
- Format: plaintext JSON `{ "<name>": "<value>" }`

V1 does not encrypt secrets at rest. The threat model is "another local user shouldn't read these"; file mode handles that. OS keychain integration is a V2 consideration.

### Policy Resolution

A secret is exposed to a sandbox only if it appears in the resolved profile's `secrets.allowed` (optionally extended via repo config `secrets.allow`). Policy fields per secret:

- `hosts` — list of hostnames the secret may be sent to. Default `[]` (no host restriction enforcement on V1; flagged for V2 host-firewall integration).
- `requireTls` — default `true`. Enforced by translating to `msb`'s secret-mount flags.
- `onViolation` — default `error`. Komora fails loudly on policy violation rather than silently dropping the secret.

### Runtime

At sandbox start, komora translates `(stored value × profile policy)` into either `msb --secret NAME=VALUE@HOST` flags or SDK `Secret.env(...)` calls (whichever the implementation chooses).

### V2 Target: Host-Side Credential Proxy

V1's runtime model passes the raw secret value into the microVM. This is acceptable for a personal sandbox but is the wrong long-term shape. The V2 target is the [Docker Sandbox kits](https://docs.docker.com/ai/sandboxes/customize/kits/) pattern: the real value stays on the host, only a placeholder enters the VM, and a host-side proxy substitutes the secret on outbound HTTPS requests to declared service domains. This requires (a) a host proxy process komora can manage, (b) microsandbox network egress routed through it, and (c) policy keyed on `network.serviceDomains` rather than per-secret `hosts`. None of this lands in V1; it is named here so the V1 schema does not paint us into a corner — see [Network Reservation](#network-reservation) below.

### Network Reservation

Profiles and repo configs reserve a top-level `network:` block for V2. V1 parses it (so editors with the schema header don't error), warns once if non-empty, and ignores it. Shape:

```yaml
network:
  allowedDomains: ["github.com", "registry.npmjs.org"]
  serviceDomains:
    "api.github.com": github
    "registry.npmjs.org": npm
```

This is borrowed verbatim from Docker kits. It lets V2 add network allowlisting and proxy-based credential injection without a schema break.

### CLI

```
komora secrets set <name>           # prompts for value (no-echo)
komora secrets set <name> --from-stdin
komora secrets list                 # names only, never values
komora secrets rm <name>
```

## MCP Servers

V1 ships **no built-in MCP-projection primitive.** Profiles handle MCP via startup scripts that write the agent's MCP config file at the agent-specific path inside the sandbox.

### Documented Pattern: Docker-in-VM

Microsandbox VMs are real VMs with their own kernel, so Docker-in-Docker (DinD) works without nested-virt issues. A profile that wants MCP servers as containers does:

1. Base on a `docker:dind`-style image (or installs Docker in a startup script).
2. Startup script: `dockerd &`.
3. Named volume on `/var/lib/docker` to persist layers across sandbox restarts.
4. `docker run` each MCP server.
5. Write the agent's MCP config pointing at `localhost:<port>`.

**Verification gap:** privileged-equivalent / kernel-feature requirements for DinD inside microsandbox are unverified. The implementation plan must verify before relying on this pattern in shipped built-in profiles.

V2 may add a first-class `mcpServers:` block to profile schema once usage patterns are clearer.

## Observability & Signals

- **Logging:** stderr only. No log file. `komora logs <name>` is a thin tail of the agent process's stderr.
- **Exit codes:** verbatim. `komora run claude` exits with whatever code the in-sandbox agent process produced.
- **PTY:** allocated when the controlling terminal is a TTY. `SIGINT` (Ctrl-C) forwarded to the in-sandbox agent. `SIGWINCH` forwarded so TUIs reflow on terminal resize.
- **Komora's signal handling:** komora itself only catches the signals it needs for cleanup (lockfile release on `SIGTERM`/`SIGINT` *after* the agent has exited). It does not intercept signals destined for the agent.

User-visible framing: running `komora run claude` should feel like running `claude` directly. Same Ctrl-C behavior, same exit code, same TUI resize behavior.

## Reference Implementation Notes

These are notes for the implementation plan, not user-facing contracts. Recorded here so the plan author has the full context.

- **Language:** TypeScript. CLI distributed as an npm package.
- **Microsandbox interface:** SDK preferred for sandbox lifecycle (`create`, `start`, `stop`, `exec`); fall back to spawning `msb` for anything the SDK doesn't cover yet.
- **Lock library:** `proper-lockfile` or equivalent.
- **Config validation:** JSON Schema → AJV at load time. Schema also published for editor IntelliSense.
- **Built-in profiles:** `src/profiles/builtin/*.yaml`, loaded from disk at startup, merged into the discovery chain after user-global.

## Open Questions Deferred to V2

- Image digest / version pinning (schema reserved).
- First-class `mcpServers:` profile block.
- OS keychain integration for the secret store.
- Host-side credential proxy (real values stay on host; see [V2 target](#v2-target-host-side-credential-proxy)).
- Host-firewall enforcement of `secrets.<name>.hosts` and `network.allowedDomains`.
- DinD verification inside microsandbox VMs.
- Kit-compat distribution (OCI / git refs) once split-out makes sense.
- Splitting built-in profiles into a sibling repo if cadence diverges.

## References

- [Docker AI Sandboxes (`sbx`) — UX north star](https://docs.docker.com/ai/sandboxes/usage/)
- [Docker Sandbox kits — V2 schema reference](https://docs.docker.com/ai/sandboxes/customize/kits/)
- [microsandbox CLI reference](https://docs.microsandbox.dev/cli/sandbox-commands.md)
- [microsandbox secrets docs](https://docs.microsandbox.dev/sandboxes/secrets.md)
- [microsandbox image support](https://docs.microsandbox.dev/sandboxes/overview.md)
