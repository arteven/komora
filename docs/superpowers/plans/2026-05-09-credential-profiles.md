# Credential Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable multi-account credential isolation via `--profile <name>` flag, and fix Claude's missing `.claude.json` persistence.

**Architecture:** Profile name (from CLI flag or `komora.config.yaml`) flows through the resolve pipeline to qualify volume names (`{agent}-home-{profile}`) and sandbox names (`{workspace}-{agent}-{profile}`). All agent volumes are renamed from `*-auth` to `*-home`. Claude gets a second volume for `.claude.json`.

**Tech Stack:** TypeScript, Vitest, Commander.js, microsandbox SDK, Ajv (JSON schema validation)

---

### Task 1: Add profile to types and validation schema

**Files:**
- Modify: `src/config/types.ts`
- Modify: `src/config/schema.ts`
- Modify: `tests/config/types.test.ts`
- Modify: `tests/config/load.test.ts`

- [ ] **Step 1: Write failing test for `profile` on RepoConfig type**

In `tests/config/types.test.ts`, update the "RepoConfig has v2 fields" test to include `profile`:

```typescript
it("RepoConfig has v2 fields", () => {
  const cfg: RepoConfig = {
    toolchain: [{ node: "22" }],
    setup: ["npm install -g typescript"],
    env: { NODE_ENV: "development" },
    mounts: [],
    secrets: ["GITHUB_TOKEN"],
    network: {
      allowedDomains: ["github.com"],
      serviceDomains: { "api.github.com": "GITHUB_TOKEN" },
    },
    raw: { cpus: 4 },
    profile: "work",
  };
  expect(cfg.toolchain![0]).toEqual({ node: "22" });
  expect(cfg.secrets).toContain("GITHUB_TOKEN");
  expect(cfg.network!.serviceDomains!["api.github.com"]).toBe("GITHUB_TOKEN");
  expect(cfg.profile).toBe("work");
});
```

And update the "ResolvedConfig merges agent + repo" test to include `profile`:

```typescript
it("ResolvedConfig merges agent + repo", () => {
  const resolved: ResolvedConfig = {
    agent: "claude",
    agentDef: {
      template: "docker/sandbox-templates:claude-code-docker",
      command: "claude",
      defaultArgs: [],
      authVolumes: [],
      defaultSecrets: [],
      defaultDomains: [],
    },
    image: "docker/sandbox-templates:claude-code-docker",
    command: "claude",
    env: { NODE_ENV: "dev" },
    mounts: [],
    secrets: ["ANTHROPIC_API_KEY"],
    domains: ["api.anthropic.com"],
    toolchain: [],
    setup: [],
    raw: {},
    bare: false,
    workspaceDir: "/tmp/test",
    workspaceSlug: "test",
    sandboxName: "test-claude",
    profile: "work",
  };
  expect(resolved.sandboxName).toBe("test-claude");
  expect(resolved.bare).toBe(false);
  expect(resolved.profile).toBe("work");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config/types.test.ts`
Expected: TypeScript error — `profile` does not exist on `RepoConfig` / `ResolvedConfig`

- [ ] **Step 3: Add `profile` to types**

In `src/config/types.ts`, add `profile?: string` to both `RepoConfig` and `ResolvedConfig`:

```typescript
export interface RepoConfig {
  toolchain?: Record<string, string>[];
  setup?: string[];
  env?: Record<string, string>;
  mounts?: Mount[];
  secrets?: string[];
  network?: NetworkConfig;
  raw?: Record<string, unknown>;
  profile?: string;
}

export interface ResolvedConfig {
  agent: string;
  agentDef: AgentDefinition;
  image: string;
  command: string;
  env: Record<string, string>;
  mounts: Mount[];
  secrets: string[];
  domains: string[];
  toolchain: Record<string, string>[];
  setup: string[];
  raw: Record<string, unknown>;
  bare: boolean;
  workspaceDir: string;
  workspaceSlug: string;
  sandboxName: string;
  profile?: string;
}
```

- [ ] **Step 4: Add `profile` to schema validation**

In `src/config/schema.ts`, add `profile` to the `repoConfigSchema` properties:

```typescript
const repoConfigSchema = {
  type: "object",
  properties: {
    toolchain: { type: "array", items: toolchainEntrySchema },
    setup: { type: "array", items: { type: "string" } },
    env: { type: "object", additionalProperties: { type: "string" } },
    mounts: { type: "array", items: mountSchema },
    secrets: { type: "array", items: { type: "string" } },
    network: networkSchema,
    raw: { type: "object" },
    profile: { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
  },
  additionalProperties: false,
};
```

- [ ] **Step 5: Write failing test for profile YAML parsing**

In `tests/config/load.test.ts`, add a test:

```typescript
it("parses config with profile", () => {
  const cfg = parseRepoConfig("profile: work");
  expect(cfg.profile).toBe("work");
});

it("rejects invalid profile name", () => {
  expect(() => parseRepoConfig("profile: Work_Bad!")).toThrow();
});
```

- [ ] **Step 6: Run all tests to verify they pass**

Run: `npx vitest run tests/config/types.test.ts tests/config/load.test.ts`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add src/config/types.ts src/config/schema.ts tests/config/types.test.ts tests/config/load.test.ts
git commit -m "feat(config): add profile field to RepoConfig and ResolvedConfig"
```

---

### Task 2: Profile-aware sandbox naming

**Files:**
- Modify: `src/sandbox/naming.ts`
- Modify: `tests/sandbox/naming.test.ts`

- [ ] **Step 1: Write failing tests for profile in sandbox name**

In `tests/sandbox/naming.test.ts`, add tests:

```typescript
it("includes profile in name when provided", () => {
  expect(sandboxName({ workspaceSlug: "komora", agent: "claude", profile: "work" })).toBe("komora-claude-work");
});

it("omits profile when undefined", () => {
  expect(sandboxName({ workspaceSlug: "komora", agent: "claude" })).toBe("komora-claude");
});

it("override still takes precedence over profile", () => {
  expect(sandboxName({ workspaceSlug: "komora", agent: "claude", profile: "work", override: "my-sandbox" })).toBe("my-sandbox");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sandbox/naming.test.ts`
Expected: TypeScript error — `profile` does not exist on `NameInput`

- [ ] **Step 3: Implement profile in sandboxName**

In `src/sandbox/naming.ts`:

```typescript
export interface NameInput {
  workspaceSlug: string;
  agent: string;
  profile?: string;
  override?: string;
}

export function sandboxName(input: NameInput): string {
  if (input.override !== undefined) {
    if (input.override.length === 0) throw new Error("--name override must not be empty");
    return input.override;
  }
  const base = `${input.workspaceSlug}-${input.agent}`;
  return input.profile ? `${base}-${input.profile}` : base;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/sandbox/naming.test.ts`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/sandbox/naming.ts tests/sandbox/naming.test.ts
git commit -m "feat(sandbox): include profile in sandbox name"
```

---

### Task 3: Profile-aware volume naming in resolve

**Files:**
- Modify: `src/config/resolve.ts`
- Modify: `tests/config/resolve.test.ts`

- [ ] **Step 1: Write failing tests for profile volume qualification**

In `tests/config/resolve.test.ts`, first update the `claude` fixture at the top of the file to rename volumes (this reflects the rename from Task 5, but the test values must match the new names now):

```typescript
const claude: AgentDefinition = {
  template: "docker/sandbox-templates:claude-code-docker",
  command: "claude",
  defaultArgs: ["--dangerously-skip-permissions"],
  authVolumes: [
    { type: "volume", name: "claude-home", target: "/home/agent/.claude" },
    { type: "volume", name: "claude-dotfile", target: "/home/agent/.claude.json" },
  ],
  defaultSecrets: ["ANTHROPIC_API_KEY"],
  defaultDomains: ["api.anthropic.com", "auth.anthropic.com"],
};
```

Then update existing tests that assert on mount names (change `claude-auth` to `claude-home` and expect the extra `claude-dotfile` mount). In the "resolves with agent defaults only" test:

```typescript
expect(resolved.mounts).toEqual([
  { type: "bind", source: "/home/user/project", target: "/home/user/project" },
  { type: "volume", name: "claude-home", target: "/home/agent/.claude" },
  { type: "volume", name: "claude-dotfile", target: "/home/agent/.claude.json" },
]);
```

And in the "merges repo config" test, update the expected mount count:

```typescript
expect(resolved.mounts).toHaveLength(4);
```

Then add new profile tests:

```typescript
it("qualifies authVolume names with profile", () => {
  const resolved = resolveConfig({
    agent: "claude",
    agentDef: claude,
    repoConfig: emptyRepo,
    workspaceDir: "/home/user/project",
    workspaceSlug: "project",
    profile: "work",
  });
  expect(resolved.mounts).toEqual([
    { type: "bind", source: "/home/user/project", target: "/home/user/project" },
    { type: "volume", name: "claude-home-work", target: "/home/agent/.claude" },
    { type: "volume", name: "claude-dotfile-work", target: "/home/agent/.claude.json" },
  ]);
  expect(resolved.profile).toBe("work");
});

it("sandbox name includes profile", () => {
  const resolved = resolveConfig({
    agent: "claude",
    agentDef: claude,
    repoConfig: emptyRepo,
    workspaceDir: "/home/user/project",
    workspaceSlug: "project",
    profile: "work",
  });
  expect(resolved.sandboxName).toBe("project-claude-work");
});

it("no profile leaves volume names unqualified", () => {
  const resolved = resolveConfig({
    agent: "claude",
    agentDef: claude,
    repoConfig: emptyRepo,
    workspaceDir: "/home/user/project",
    workspaceSlug: "project",
  });
  expect(resolved.mounts[1]).toEqual({ type: "volume", name: "claude-home", target: "/home/agent/.claude" });
  expect(resolved.mounts[2]).toEqual({ type: "volume", name: "claude-dotfile", target: "/home/agent/.claude.json" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config/resolve.test.ts`
Expected: Fails — `profile` not on `ResolveInput`, volume names still `claude-auth`

- [ ] **Step 3: Implement profile-aware resolve**

In `src/config/resolve.ts`, add `profile` to `ResolveInput` and use it:

```typescript
export interface ResolveInput {
  agent: string;
  agentDef: AgentDefinition;
  repoConfig: RepoConfig;
  workspaceDir: string;
  workspaceSlug: string;
  nameOverride?: string;
  bare?: boolean;
  profile?: string;
}
```

In the `resolveConfig` function, replace the auth volume assembly:

```typescript
export function resolveConfig(input: ResolveInput): ResolvedConfig {
  const { agent, agentDef, repoConfig, workspaceDir, workspaceSlug, nameOverride, bare, profile } = input;

  // ... raw conflict check unchanged ...

  const workspaceBind = { type: "bind" as const, source: workspaceDir, target: workspaceDir };
  const agentAuthVolumes = bare ? [] : agentDef.authVolumes.map((v) =>
    profile && v.name ? { ...v, name: `${v.name}-${profile}` } : v,
  );
  const repoMounts = (repoConfig.mounts ?? []).map((m) =>
    m.source ? { ...m, source: resolveSource(m.source, workspaceDir) } : m,
  );
  const mounts = [workspaceBind, ...agentAuthVolumes, ...repoMounts];

  // ... secrets/domains unchanged ...

  return {
    agent,
    agentDef,
    image: agentDef.template,
    command: agentDef.command,
    env: repoConfig.env ?? {},
    mounts,
    secrets: allSecrets,
    domains: allDomains,
    toolchain: repoConfig.toolchain ?? [],
    setup: repoConfig.setup ?? [],
    raw,
    bare: !!bare,
    workspaceDir,
    workspaceSlug,
    sandboxName: sandboxName({ workspaceSlug, agent, profile, override: nameOverride }),
    profile,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/config/resolve.test.ts`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/config/resolve.ts tests/config/resolve.test.ts
git commit -m "feat(config): apply profile suffix to volume and sandbox names"
```

---

### Task 4: Rename agent volumes and add Claude dotfile volume

**Files:**
- Modify: `src/agents/claude.ts`
- Modify: `src/agents/opencode.ts`
- Modify: `src/agents/gemini.ts`
- Modify: `src/agents/copilot.ts`
- Modify: `src/agents/codex.ts`
- Modify: `tests/agents/registry.test.ts`
- Modify: `tests/config/index.test.ts`

- [ ] **Step 1: Update agent definitions**

`src/agents/claude.ts`:
```typescript
import type { AgentDefinition } from "../config/types.js";

export const claude: AgentDefinition = {
  template: "docker/sandbox-templates:claude-code-docker",
  command: "claude",
  defaultArgs: ["--dangerously-skip-permissions"],
  memoryMib: 2048,
  cpus: 2,
  authVolumes: [
    { type: "volume", name: "claude-home", target: "/home/agent/.claude" },
    { type: "volume", name: "claude-dotfile", target: "/home/agent/.claude.json" },
  ],
  defaultSecrets: ["ANTHROPIC_API_KEY"],
  defaultDomains: ["api.anthropic.com", "auth.anthropic.com"],
};
```

`src/agents/opencode.ts`:
```typescript
import type { AgentDefinition } from "../config/types.js";

export const opencode: AgentDefinition = {
  template: "docker/sandbox-templates:opencode-docker",
  command: "opencode",
  defaultArgs: [],
  authVolumes: [{ type: "volume", name: "opencode-home", target: "/home/agent/.opencode" }],
  defaultSecrets: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"],
  defaultDomains: ["api.anthropic.com", "api.openai.com"],
};
```

`src/agents/gemini.ts`:
```typescript
import type { AgentDefinition } from "../config/types.js";

export const gemini: AgentDefinition = {
  template: "docker/sandbox-templates:gemini-docker",
  command: "gemini",
  defaultArgs: [],
  authVolumes: [{ type: "volume", name: "gemini-home", target: "/home/agent/.gemini" }],
  defaultSecrets: ["GEMINI_API_KEY"],
  defaultDomains: ["generativelanguage.googleapis.com"],
};
```

`src/agents/copilot.ts`:
```typescript
import type { AgentDefinition } from "../config/types.js";

export const copilot: AgentDefinition = {
  template: "docker/sandbox-templates:copilot-docker",
  command: "copilot",
  defaultArgs: [],
  authVolumes: [{ type: "volume", name: "copilot-home", target: "/home/agent/.copilot" }],
  defaultSecrets: ["GITHUB_TOKEN"],
  defaultDomains: ["api.github.com", "github.com", "copilot-proxy.githubusercontent.com"],
};
```

`src/agents/codex.ts`:
```typescript
import type { AgentDefinition } from "../config/types.js";

export const codex: AgentDefinition = {
  template: "docker/sandbox-templates:codex-docker",
  command: "codex",
  defaultArgs: [],
  authVolumes: [{ type: "volume", name: "codex-home", target: "/home/agent/.codex" }],
  defaultSecrets: ["OPENAI_API_KEY"],
  defaultDomains: ["api.openai.com"],
};
```

- [ ] **Step 2: Update registry test**

In `tests/agents/registry.test.ts`, update the "returns claude built-in agent" test:

```typescript
it("returns claude built-in agent", async () => {
  const agent = await getAgent("claude");
  expect(agent.template).toBe("docker/sandbox-templates:claude-code-docker");
  expect(agent.command).toBe("claude");
  expect(agent.authVolumes).toEqual([
    { type: "volume", name: "claude-home", target: "/home/agent/.claude" },
    { type: "volume", name: "claude-dotfile", target: "/home/agent/.claude.json" },
  ]);
  expect(agent.defaultSecrets).toContain("ANTHROPIC_API_KEY");
  expect(agent.defaultDomains).toContain("api.anthropic.com");
});
```

- [ ] **Step 3: Update config/index test mock**

In `tests/config/index.test.ts`, update the mock at the top:

```typescript
vi.mock("../../src/agents/registry.js", () => ({
  getAgent: vi.fn().mockResolvedValue({
    template: "docker/sandbox-templates:claude-code-docker",
    command: "claude",
    defaultArgs: ["--dangerously-skip-permissions"],
    authVolumes: [
      { type: "volume", name: "claude-home", target: "/home/agent/.claude" },
      { type: "volume", name: "claude-dotfile", target: "/home/agent/.claude.json" },
    ],
    defaultSecrets: ["ANTHROPIC_API_KEY"],
    defaultDomains: ["api.anthropic.com"],
  }),
}));
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/agents/claude.ts src/agents/opencode.ts src/agents/gemini.ts src/agents/copilot.ts src/agents/codex.ts tests/agents/registry.test.ts tests/config/index.test.ts
git commit -m "feat(agents): rename auth volumes to *-home, add claude-dotfile volume"
```

---

### Task 5: Wire profile through CLI and config loading

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/commands/run.ts`
- Modify: `src/config/index.ts`
- Modify: `tests/commands/run.test.ts`
- Modify: `tests/config/index.test.ts`

- [ ] **Step 1: Write failing test for --profile in run command**

In `tests/commands/run.test.ts`, add a test:

```typescript
it("passes --profile to loadResolvedConfig", async () => {
  const { loadResolvedConfig } = await import("../../src/config/index.js");
  await run({ agent: "claude", argv: [], workspaceDir: "/tmp", profile: "work" });
  expect(loadResolvedConfig).toHaveBeenCalledWith(
    expect.objectContaining({ profile: "work" })
  );
});
```

- [ ] **Step 2: Write failing test for profile from config YAML**

In `tests/config/index.test.ts`, add a test:

```typescript
it("reads profile from komora.config.yaml", async () => {
  const fs = await import("node:fs/promises");
  vi.mocked(fs.readFile).mockResolvedValue("profile: work\n");

  const cfg = await loadResolvedConfig({
    workspaceDir: "/home/user/project",
    agent: "claude",
  });
  expect(cfg.profile).toBe("work");
});

it("CLI profile overrides config file profile", async () => {
  const fs = await import("node:fs/promises");
  vi.mocked(fs.readFile).mockResolvedValue("profile: personal\n");

  const cfg = await loadResolvedConfig({
    workspaceDir: "/home/user/project",
    agent: "claude",
    profile: "work",
  });
  expect(cfg.profile).toBe("work");
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/commands/run.test.ts tests/config/index.test.ts`
Expected: Fails — `profile` not on `RunOpts` or `LoadOptions`

- [ ] **Step 4: Add `--profile` to CLI**

In `src/cli.ts`, add the option to both `run` and `create` commands. For `run`:

```typescript
program
  .command("run <agent>")
  .option("--bare", "Strip agent defaults (auth volumes, default secrets, default domains)")
  .option("--dry-run", "Print resolved config without creating anything")
  .option("--name <override>", "Override sandbox name")
  .option("--profile <name>", "Credential profile name (isolates auth volumes and sandbox)")
  .option("--verbose", "Show init sequence output")
  .allowUnknownOption(true)
  .description("Find-or-create the sandbox and run the agent (everything after `--` is forwarded).")
  .action(async (agent, opts, command) => {
    const argv = command.args.slice(1);
    process.exit(
      await run({
        agent,
        name: opts.name,
        bare: !!opts.bare,
        dryRun: !!opts.dryRun,
        profile: opts.profile,
        verbose: !!opts.verbose,
        argv,
        workspaceDir: process.cwd(),
      }),
    );
  });
```

For `create`:

```typescript
program
  .command("create <agent>")
  .option("--bare", "Strip agent defaults (auth volumes, default secrets, default domains)")
  .option("--name <override>", "Override sandbox name")
  .option("--profile <name>", "Credential profile name (isolates auth volumes and sandbox)")
  .option("--verbose", "Show init sequence output")
  .description("Create a sandbox without running an agent.")
  .action((agent, opts) => create({ agent, name: opts.name, bare: !!opts.bare, profile: opts.profile, verbose: !!opts.verbose, workspaceDir: process.cwd() }));
```

- [ ] **Step 5: Add `profile` to RunOpts and pass through**

In `src/commands/run.ts`, add `profile` to `RunOpts` and pass it to `loadResolvedConfig`:

```typescript
export interface RunOpts {
  agent?: string;
  name?: string;
  bare?: boolean;
  dryRun?: boolean;
  profile?: string;
  verbose?: boolean;
  argv: string[];
  workspaceDir: string;
}

export async function run(opts: RunOpts): Promise<number> {
  const cfg = await loadResolvedConfig({
    workspaceDir: opts.workspaceDir,
    agent: opts.agent,
    nameOverride: opts.name,
    bare: opts.bare,
    profile: opts.profile,
  });

  // ... rest unchanged ...
}
```

- [ ] **Step 6: Add `profile` to LoadOptions and wire in config/index.ts**

In `src/config/index.ts`, add `profile` to `LoadOptions` and pass it through, with CLI taking precedence over config file:

```typescript
export interface LoadOptions {
  workspaceDir: string;
  agent?: string;
  nameOverride?: string;
  bare?: boolean;
  profile?: string;
}

export async function loadResolvedConfig(opts: LoadOptions): Promise<ResolvedConfig> {
  if (!opts.agent) {
    throw new Error("agent is required — pass it as `komora run <agent>`");
  }

  const repoYaml = await readIfExists(path.join(opts.workspaceDir, "komora.config.yaml"));
  const repoConfig: RepoConfig = repoYaml ? parseRepoConfig(repoYaml) : {};

  const agentDef = await getAgent(opts.agent);

  const profile = opts.profile ?? repoConfig.profile;

  return resolveConfig({
    agent: opts.agent,
    agentDef,
    repoConfig,
    workspaceDir: opts.workspaceDir,
    workspaceSlug: workspaceSlug(opts.workspaceDir),
    nameOverride: opts.nameOverride,
    bare: opts.bare,
    profile,
  });
}
```

- [ ] **Step 7: Run all tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add src/cli.ts src/commands/run.ts src/config/index.ts tests/commands/run.test.ts tests/config/index.test.ts
git commit -m "feat(cli): add --profile flag for credential isolation"
```

---

### Task 6: Update create command for profile support

**Files:**
- Modify: `src/commands/create.ts`
- Modify: `tests/commands/create-start.test.ts`

- [ ] **Step 1: Add `profile` to CreateOpts and pass through**

In `src/commands/create.ts`, add `profile` to `CreateOpts` and pass it to `loadResolvedConfig`:

```typescript
export interface CreateOpts {
  agent?: string;
  name?: string;
  bare?: boolean;
  profile?: string;
  verbose?: boolean;
  workspaceDir: string;
}

export async function create(opts: CreateOpts): Promise<void> {
  const cfg = await loadResolvedConfig({
    workspaceDir: opts.workspaceDir,
    agent: opts.agent,
    nameOverride: opts.name,
    bare: opts.bare,
    profile: opts.profile,
  });
  await ensureSandbox(cfg, { verbose: opts.verbose });
}
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add src/commands/create.ts
git commit -m "feat(cli): add --profile to create command"
```

---

### Task 7: Profile name validation

**Files:**
- Modify: `src/config/resolve.ts`
- Modify: `tests/config/resolve.test.ts`

- [ ] **Step 1: Write failing test for invalid profile name**

In `tests/config/resolve.test.ts`, add:

```typescript
it("rejects invalid profile name", () => {
  expect(() =>
    resolveConfig({
      agent: "claude",
      agentDef: claude,
      repoConfig: emptyRepo,
      workspaceDir: "/tmp",
      workspaceSlug: "tmp",
      profile: "Work_Bad!",
    })
  ).toThrow(/invalid profile/i);
});

it("accepts valid profile names", () => {
  for (const name of ["work", "personal", "my-team", "dev-2"]) {
    expect(() =>
      resolveConfig({
        agent: "claude",
        agentDef: claude,
        repoConfig: emptyRepo,
        workspaceDir: "/tmp",
        workspaceSlug: "tmp",
        profile: name,
      })
    ).not.toThrow();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config/resolve.test.ts`
Expected: Fails — no validation, `Work_Bad!` is accepted

- [ ] **Step 3: Add validation in resolveConfig**

In `src/config/resolve.ts`, add validation at the top of `resolveConfig`:

```typescript
const PROFILE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function resolveConfig(input: ResolveInput): ResolvedConfig {
  const { agent, agentDef, repoConfig, workspaceDir, workspaceSlug, nameOverride, bare, profile } = input;

  if (profile !== undefined && !PROFILE_RE.test(profile)) {
    throw new Error(`invalid profile name '${profile}': must be lowercase alphanumeric with hyphens`);
  }

  // ... rest of function ...
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/config/resolve.test.ts`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/config/resolve.ts tests/config/resolve.test.ts
git commit -m "feat(config): validate profile names (lowercase alphanumeric with hyphens)"
```

---

### Task 8: Final integration test and cleanup

**Files:**
- All test files

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Manual smoke test with --dry-run**

Run: `npx tsx src/cli.ts run claude --profile work --dry-run`
Expected: YAML output shows `profile: work`, sandbox name includes `-work`, volume names include `-work`

Run: `npx tsx src/cli.ts run claude --dry-run`
Expected: YAML output shows no profile, standard volume names without suffix

- [ ] **Step 4: Commit if any fixes were needed**

Only if changes were made during smoke testing.
