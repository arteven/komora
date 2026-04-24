# Komora V1 Design

## Summary

`komora` is a thin TypeScript wrapper around `microsandbox` that defines reusable conventions and utilities for personal agent sandboxes.

V1 is intentionally closer to `docker compose` than to a new sandbox platform:

- `komora` composes and resolves sandbox configuration
- `komora` stays close to raw `microsandbox` concepts and capabilities
- anything `komora` does should be conceptually achievable with `msb` directly

The primary workflow is workspace-aware and agent-first: running `komora` inside a folder resolves a sandbox tied to that workspace, with support for agent flavors such as `claude` and `opencode` and environment profiles such as `nodejs` or `kotlin-android`.

## Goals

- Build personal sandboxes on top of the TypeScript `microsandbox` SDK
- Standardize common conventions for OCI images, secrets, MCP-related setup, volumes, skills, commands, and plugin availability
- Keep sandbox identity tied to the current workspace directory
- Support both `claude` and `opencode` as first-class agent flavors
- Keep the wrapper minimal, inspectable, and close to native `microsandbox`

## Non-Goals

- Creating a new sandbox runtime or abstraction layer that hides `microsandbox`
- Replacing all raw `microsandbox` configuration with a large `komora`-specific schema
- Managing bidirectional host and sandbox synchronization for MCP state
- Building a large persistent lifecycle system for always-on named environments
- Depending on future `Sandboxfile` support in v1

## Core Model

The resolved sandbox model for v1 is:

`workspace + agent + profile + local secrets + CLI flags`

Definitions:

- `workspace`: the current folder and its derived sandbox context
- `agent`: the user-facing flavor running in the sandbox, initially `claude` or `opencode`
- `profile`: the environment definition, such as `nodejs` or `kotlin-android`
- `local secrets`: secret values stored outside the profile, with policy defined in code
- `CLI flags`: the highest-precedence overrides

This model separates who runs inside the sandbox from what environment that sandbox provides.

## Design Principles

- Thin wrapper over `microsandbox`, not a platform fork
- TypeScript-first configuration, with `komora.config.ts` as the workspace entrypoint
- Small default surface area in v1
- Reuse profile definitions across workspaces where practical
- Keep escape hatches available for raw `microsandbox` fields and behaviors
- Prefer ephemeral run-oriented workflows over persistent lifecycle commands

## Workspace Convention

`komora` is workspace-aware by default.

Running `komora` in a directory resolves a sandbox for that directory. The current folder becomes:

- the default workspace mount source on the host
- the default in-sandbox working directory
- part of the derived sandbox identity

This allows one project folder to have independent sandboxes for different agents. Running the same command from another folder resolves a different sandbox.

The naming scheme should be deterministic and derived from:

- workspace path or workspace slug
- selected agent
- selected profile

The exact string format is an implementation detail, but the result must be stable and inspectable.

## Workspace Config

Each workspace may define `komora.config.ts` at the project root.

This file is the TypeScript workspace configuration entrypoint. It should be loadable by the compiled `komora` CLI through a TypeScript-aware config loader, while keeping `komora` itself runtime-agnostic from the user perspective.

Configuration precedence:

1. CLI flags
2. `komora.config.ts`
3. global defaults

V1 should keep the standardized workspace config surface small. It should primarily support:

- selecting a default profile
- selecting or customizing default agent behavior
- workspace mount and workdir-related overrides when needed
- secret references
- a small set of command overrides
- optional raw `microsandbox` overrides

The config should remain extensible for future customization, but v1 should not standardize a large schema prematurely.

## Profiles

Profiles define reusable environment intent.

Examples:

- `base`
- `nodejs`
- `kotlin-android`

Profiles can come from two sources in v1:

- built-in profiles shipped with `komora`
- repo-local profiles defined in this repository

V1 uses a hybrid model:

- built-ins provide convenient defaults
- repo-local profiles provide the main customization path for personal environments

Profiles should describe reusable environment concerns such as:

- image reference and image tag conventions
- rootfs patches and scripts
- mount conventions for skills and plugins
- named commands
- MCP-related projection into the sandbox
- required secrets and their allow-host policies
- raw `microsandbox` overrides

Workspace config should usually select a profile and apply light overrides rather than redefining a complete environment inline.

## Agent Flavors

V1 supports two first-class agent flavors:

- `claude`
- `opencode`

An agent flavor is an overlay, not a full environment definition. It can customize:

- default launch command
- agent-specific mounts, env, or helper files
- image tag selection when needed
- agent-specific command defaults

Agent overlays are composed after the selected profile.

## Profile Composition

The recommended merge order is:

1. global defaults
2. selected profile
3. selected agent overlay
4. workspace config
5. CLI flags

This keeps profiles reusable, agents focused, workspaces lightweight, and CLI behavior explicit.

## Images

V1 supports both styles of environment customization:

- stable images published externally and referenced by profile
- runtime customization via `microsandbox` scripts and patches at sandbox creation time

Image definitions live in this repository.

Publishing and build orchestration are not first-class `komora` CLI responsibilities in v1. Those flows are handled by local scripts or GitHub Actions.

The image tag convention should follow:

`{agent}-{profile}`

This keeps image identity predictable while allowing different agent and environment combinations.

Plugin installation may happen through:

- image build time
- sandbox startup scripts
- mounted directories

Profiles may mix these strategies.

## Secrets

`microsandbox` secrets use placeholder substitution with explicit allowed-host policy, so `komora` must model both secret values and access policy.

V1 secret design:

- `komora` manages local secret values in a local secret store
- profiles define which secrets are required and which hosts or host patterns are allowed
- policy remains in TypeScript profile definitions, not in the secret value store
- at runtime, `komora` maps resolved values and policy to native `microsandbox` secret definitions

This keeps credential material local and keeps sandbox behavior reviewable in code.

## Mounts And Volumes

V1 supports both bind mounts and named volumes where `microsandbox` supports them.

Defaults:

- the workspace directory is automatically mounted from the host
- the mounted workspace becomes the default in-sandbox workdir
- bind mounts are preferred for actively edited local assets such as skills or plugins

Profiles may also opt into named volumes for more stable or reusable setups.

V1 should stay explicit that concurrent writers to the same mounted storage are still subject to normal filesystem race conditions.

## MCP Projection

MCP-related behavior in v1 is one-directional:

- host-defined configuration may be projected into the sandbox
- `komora` may generate sandbox-side files, env, or helper commands needed by tools inside the VM
- `komora` does not attempt bidirectional sync
- `komora` does not auto-edit host-side agent configuration files in v1

This keeps MCP support useful without creating risky or surprising host mutations.

## Commands And Interactive Use

`komora` is centered on run-oriented workflows.

Interactive PTY support is a requirement for v1 because the target workflows include interactive TUI usage.

The `microsandbox` TypeScript SDK already provides:

- `attach()`
- `attachShell()`
- PTY support through execution APIs

However, microsandbox's first-class session listing and session reattachment are documented as coming soon, so v1 should not invent a durable session abstraction on top.

The v1 interaction model should therefore be:

- create a sandbox for the resolved workspace-agent-profile combination
- launch the requested agent or command inside it
- support PTY attach for interactive usage
- stop the sandbox when the primary interactive process exits
- start a fresh process by default on the next run
- treat resume/continue behaviors as explicit flags rather than the default

Re-entering the same sandbox in v1 is supported by starting a fresh shell or command, not by introducing a new session layer.

## CLI

V1 keeps the CLI intentionally narrow.

Primary commands:

- `komora run <agent> [--profile <name>] [-- <command...>]`
- `komora exec <agent> -- <command...>`
- `komora rm <agent>`
- `komora config show <agent>`
- `komora secrets ...`

Behavior:

- `run` is the primary entrypoint
- `run` resolves the current workspace, selected agent, profile, and secrets
- `run` starts the sandbox and launches the agent or supplied command
- interactive usage is handled through `run`, including PTY-backed flows
- when the user exits the primary agent process, the sandbox stops
- running again starts a fresh agent process unless explicit resume-like flags are provided
- `exec` performs one-shot commands against the resolved sandbox model
- `rm` removes sandbox state so it can be recreated cleanly

Excluded from the v1 CLI:

- standalone `attach`
- `up` and `down`
- first-class image build or publish commands

## Resolver Output

The resolver should compile high-level `komora` inputs into:

- a native `microsandbox` configuration object
- a small runtime execution plan describing how to invoke the selected workflow

The generated result should remain understandable as ordinary `microsandbox` configuration plus thin orchestration metadata.

This inspectability is important so users can reason about `komora` in native microsandbox terms.

## Implementation Shape

V1 should be organized into a small set of focused modules:

1. Config loader
Loads `komora.config.ts`, resolves workspace context, and merges CLI flags with defaults.

2. Profile registry
Resolves built-in and repo-local profiles by name.

3. Agent overlays
Defines `claude` and `opencode` overlays.

4. Resolver
Combines workspace context, profile, agent, secrets, and CLI flags into concrete `microsandbox` config and execution intent.

5. Runner
Creates the sandbox, executes the chosen run or exec flow, handles PTY where needed, and stops the sandbox on process exit.

6. Secret manager
Reads and writes local secret values and maps them to `microsandbox` secret entries at runtime.

## V1 Scope

Included:

- workspace-aware sandbox identity from current directory
- `komora.config.ts` loading through a TypeScript-aware loader
- built-in and repo-local profile support
- first-class `claude` and `opencode` agent flavors
- automatic workspace mount and in-sandbox workdir resolution
- local secret value management with profile-defined allow-host policy
- PTY-backed interactive runs
- narrow CLI with `run`, `exec`, `rm`, `config show`, and secret commands
- profile-to-microsandbox resolution with raw escape hatches

Deferred:

- `Sandboxfile` support until microsandbox stabilizes it
- automatic image build and publish orchestration inside the `komora` CLI
- bidirectional MCP synchronization
- a persistent always-on sandbox lifecycle UX
- a custom session system layered over unfinished microsandbox session APIs
- a large exhaustive config schema for every possible future capability

## Open Refinement Areas

The following areas are intentionally left open for later refinement without blocking v1 planning:

- the exact shape of built-in versus repo-local profile authoring APIs
- how much agent-specific behavior belongs in overlays versus profiles
- the exact local secret store format and location
- the exact sandbox naming algorithm

These are implementation details that should be decided in the planning phase while preserving the approved v1 boundaries above.
