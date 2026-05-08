# Credential Profiles

**Date:** 2026-05-08
**Branch:** `feat/v2-implementation`

## Problem

Komora runs AI agents in isolated microsandbox VMs. Each agent persists credentials in a single named volume (e.g., `claude-auth`). Two issues:

1. Claude Code stores onboarding state in `/home/agent/.claude.json` (outside the `~/.claude/` volume), so each new sandbox triggers re-onboarding.
2. Users with multiple provider accounts (e.g., work and personal Anthropic accounts) have no way to isolate credentials — all sandboxes share the same volume.

## Design

### Volume renaming

Rename `authVolumes` from `*-auth` to `*-home` to reflect that they mount the agent's config home directory:

| Agent | Volume name | Mount target |
|-------|------------|-------------|
| Claude | `claude-home` | `/home/agent/.claude` |
| OpenCode | `opencode-home` | `/home/agent/.opencode` |
| Gemini | `gemini-home` | `/home/agent/.gemini` |
| Copilot | `copilot-home` | `/home/agent/.copilot` |
| Codex | `codex-home` | `/home/agent/.codex` |

Claude gets a second volume: `claude-dotfile` mounted at `/home/agent/.claude.json` for onboarding/settings state.

No backwards compatibility — existing `*-auth` volumes are renamed manually.

### Profile resolution

Profile is determined by (first wins):

1. `--profile <name>` CLI flag on `komora run`
2. `profile` field in `komora.config.yaml`
3. No profile — volumes use base names, no suffix

Profiles are agent-specific: a `work` profile for Claude has no relationship to a `work` profile for OpenCode.

### Naming with profiles

When a profile is active, it qualifies both volume names and sandbox names:

| | No profile | `--profile work` |
|---|---|---|
| Sandbox name | `{workspace}-{agent}` | `{workspace}-{agent}-{profile}` |
| Volume (home) | `{agent}-home` | `{agent}-home-{profile}` |
| Volume (dotfile, Claude only) | `claude-dotfile` | `claude-dotfile-{profile}` |

Profiles are created implicitly on first use (volume auto-created by microsandbox SDK). No explicit creation step.

Profile names must be lowercase alphanumeric with hyphens (same rules as workspace slugs). Invalid names are rejected at CLI parse time.

### Config changes

**`komora.config.yaml`** — new optional field:

```yaml
profile: work
```

**TypeScript types:**

- `RepoConfig` — add `profile?: string`
- `ResolvedConfig` — add `profile?: string`

### Resolution logic

In `resolveConfig()`, when profile is set:

1. Each `authVolume` name gets `-{profile}` appended
2. Profile string is stored on `ResolvedConfig` for downstream use

In `sandboxName()`, when profile is set:

1. Name becomes `{workspaceSlug}-{agent}-{profile}` instead of `{workspaceSlug}-{agent}`

## Files to modify

| File | Change |
|---|---|
| `src/agents/claude.ts` | Rename volume, add `claude-dotfile` volume |
| `src/agents/opencode.ts` | Rename `opencode-auth` → `opencode-home` |
| `src/agents/gemini.ts` | Rename `gemini-auth` → `gemini-home` |
| `src/agents/copilot.ts` | Rename `copilot-auth` → `copilot-home` |
| `src/agents/codex.ts` | Rename `codex-auth` → `codex-home` |
| `src/config/types.ts` | Add `profile?: string` to `RepoConfig` and `ResolvedConfig` |
| `src/config/resolve.ts` | Apply profile suffix to authVolume names |
| `src/sandbox/naming.ts` | Include profile in sandbox name |
| `src/cli.ts` | Add `--profile` option to `run` command |
| `src/commands/run.ts` | Pass profile through to resolve |
| `src/config/index.ts` | Read `profile` from `komora.config.yaml` |
| Tests | Update for renamed volumes and profile logic |

## Not in scope

- Profile management commands (`komora profile list/delete`) — saved as followup
- Migration of existing `*-auth` volumes
- Backwards compatibility shims
