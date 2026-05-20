# Personal Dev Box Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite komora as a thin orchestrator around `msb` that builds and manages **one persistent personal dev VM** per host, replacing the per-workspace ephemeral sandbox model.

**Architecture:** Single manifest (`~/.config/komora/box.yaml`) → AJV-validated `ResolvedBox` → `msb`-backed lifecycle commands (`bake`, `rebuild`, `up`, `down`, `pause`, `resume`, `destroy`, `ssh`, `attach`, `secret`, `status`, `logs`). Three layers compose the box: base image (baked snapshot), manifest (declares mounts, volumes, secrets, network, ssh, features), personal-layer (named volume **or** host bind-mount). Tiered secrets: workload via `secretEnv` with domain binding; identity via `SSH_AUTH_SOCK` forwarding. See `docs/design/2026-05-19-personal-dev-box-design.md`.

**Tech Stack:** TypeScript ESM (Node ≥22), commander, js-yaml, AJV, microsandbox SDK ^0.4.6, vitest, proper-lockfile.

---

## File Structure

### New (`src/box/` — top-level rewrite)

| File | Responsibility |
|---|---|
| `src/box/types.ts` | `BoxManifest`, `ResolvedBox`, `Mount`, `VolumeDecl`, `WorkloadSecret`, `IdentitySecret`, `NetworkPolicy`, `Toolchain`, `Feature` |
| `src/box/schema.ts` | AJV schema for `box.yaml` (strict; rejects unknown keys) |
| `src/box/load.ts` | Read + parse + validate `box.yaml` from a path or default location |
| `src/box/resolve.ts` | Expand secret references, resolve `~`, compute derived fields |
| `src/box/paths.ts` | Default manifest path; default base-image snapshot name |
| `src/box/index.ts` | Public entry point: `loadBox()`, re-exports |

### New (`src/box/backend/`)

| File | Responsibility |
|---|---|
| `src/box/backend/msb.ts` | Thin wrapper around msb CLI for streaming/long-running ops (logs, bake build) |
| `src/box/backend/sdk.ts` | Wrapper around microsandbox SDK for structured lifecycle calls |
| `src/box/backend/lifecycle.ts` | `up`, `down`, `pause`, `resume`, `destroy` operations |
| `src/box/backend/image.ts` | `bake` — build base image, snapshot it |
| `src/box/backend/rebuild.ts` | Recreate VM from manifest + base snapshot, reattach volumes |
| `src/box/backend/ssh.ts` | sshd readiness probe, host-key pinning |
| `src/box/backend/status.ts` | Inspect current VM state (running/stopped/missing/paused) + sshd readiness |

### New (`src/secrets/` — replaces existing)

| File | Responsibility |
|---|---|
| `src/secrets/keychain.ts` | OS keychain integration (libsecret on Linux); fallback to mode-0600 file store |
| `src/secrets/tiers.ts` | Classify + filter workload vs identity secrets from a `ResolvedBox` |
| `src/secrets/inject.ts` | Convert workload secrets to `secretEnv` declarations on msb builder |

### New (`src/commands/`)

| File | Responsibility |
|---|---|
| `src/commands/bake.ts` | `komora bake` |
| `src/commands/rebuild.ts` | `komora rebuild` |
| `src/commands/up.ts` | `komora up` |
| `src/commands/down.ts` | `komora down` |
| `src/commands/pause.ts` | `komora pause` / `resume` |
| `src/commands/destroy.ts` | `komora destroy` |
| `src/commands/ssh.ts` | `komora ssh` |
| `src/commands/attach.ts` | `komora attach` |
| `src/commands/status.ts` | `komora status` |
| `src/commands/logs.ts` | `komora logs` (passthrough; replaces existing) |
| `src/commands/secret.ts` | `komora secret set/list/rm` (replaces `secrets.ts`) |

### New (`src/baker/` — base image recipe)

| File | Responsibility |
|---|---|
| `src/baker/recipe.ts` | Compose shell script that installs toolchains, agents, packages |
| `src/baker/agents.ts` | Map agent names to install commands |
| `src/baker/toolchains.ts` | Map toolchain entries to install commands |
| `src/baker/install/*.sh` | Install scripts (mounted into the baking VM): `node.sh`, `python.sh`, `go.sh`, `rust.sh`, `bun.sh`, `dotnet.sh`, `agent-claude.sh`, `agent-opencode.sh`, `agent-gemini.sh`, `agent-copilot.sh`, `agent-codex.sh`, `sshd.sh`, `mise.sh` |

### Modified

| File | Change |
|---|---|
| `src/cli.ts` | Replace all subcommands with new set; bump version to 0.3.0 |
| `package.json` | `name` stays `komora`; `description` updated; `bin` unchanged; `files` updated to include `src/baker/install/*.sh` instead of `src/toolchains/` |
| `CLAUDE.md` | Update "Current state" + "Architecture" sections |
| `docs/architecture.md` | Replace with pointer to design spec (or rewrite) |

### Removed

| Path | Reason |
|---|---|
| `src/agents/` (entire) | Agents baked into image; no runtime registry |
| `src/config/` (entire) | Replaced by `src/box/` |
| `src/sandbox/` (entire) | Replaced by `src/box/backend/` |
| `src/toolchains/` (entire) | Replaced by `src/baker/` |
| `src/commands/run.ts`, `create.ts`, `start.ts`, `stop.ts`, `rm.ts`, `exec.ts`, `secrets.ts`, `ls.ts` | Replaced |
| `tests/agents/`, `tests/config/`, `tests/sandbox/`, `tests/toolchains/`, all old command tests | Replaced |

### Tests (new structure)

| Dir | Coverage |
|---|---|
| `tests/box/` | `types.test.ts`, `schema.test.ts`, `load.test.ts`, `resolve.test.ts`, `paths.test.ts` |
| `tests/box/backend/` | `msb.test.ts`, `sdk.test.ts`, `lifecycle.test.ts`, `image.test.ts`, `rebuild.test.ts`, `ssh.test.ts`, `status.test.ts` |
| `tests/secrets/` | `keychain.test.ts`, `tiers.test.ts`, `inject.test.ts` |
| `tests/commands/` | one `*.test.ts` per command |
| `tests/baker/` | `recipe.test.ts`, `agents.test.ts`, `toolchains.test.ts` |
| `tests/integration/` | `bake-rebuild-ssh.e2e.test.ts` (gated behind `KOMORA_E2E=1`) |
| `tests/fixtures/box/` | YAML fixtures: `minimal.yaml`, `full.yaml`, `invalid-*.yaml`, `personal-volume.yaml`, `personal-mount.yaml` |

---

## Branch & commit conventions

Plan executes on branch `feat/personal-dev-box` (already created). Each task ends with a conventional-commit commit. Squash-merge to master via `--no-ff` after all tasks done.

---

## Phase 0 — Bootstrap & cleanup

### Task 0.1: Wipe v2 source and tests

**Files:**
- Delete: `src/agents/`, `src/config/`, `src/sandbox/`, `src/toolchains/`, `src/commands/`, `src/secrets/`, `src/util/workspace.ts`
- Delete: `tests/agents/`, `tests/config/`, `tests/sandbox/`, `tests/toolchains/`, `tests/commands/`, `tests/secrets/`, `tests/util/workspace.test.ts`, `tests/integration/run.e2e.test.ts`
- Keep: `src/util/log.ts`, `src/util/paths.ts`, `tests/util/log.test.ts`, `tests/util/paths.test.ts`, `tests/smoke.test.ts` (it'll be rewritten in Task 11.1)
- Modify: `src/cli.ts` (stub it out — leave just the shebang and a placeholder `Command`)

- [ ] **Step 1: Delete old source dirs**

```bash
rm -rf src/agents src/config src/sandbox src/toolchains src/commands src/secrets
rm src/util/workspace.ts
```

- [ ] **Step 2: Delete old tests**

```bash
rm -rf tests/agents tests/config tests/sandbox tests/toolchains tests/commands tests/secrets tests/integration
rm tests/util/workspace.test.ts tests/smoke.test.ts
```

- [ ] **Step 3: Stub `src/cli.ts`**

Replace contents with:

```typescript
#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();
program.name("komora").description("Personal dev VM orchestrator.").version("0.3.0");

program.parseAsync(process.argv);
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS (no source means no type errors)

- [ ] **Step 5: Verify tests pass**

Run: `npm test`
Expected: only `tests/util/log.test.ts` and `tests/util/paths.test.ts` run; PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove v2 sources to prepare for personal dev box rewrite

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 0.2: Update `src/util/paths.ts` for the new manifest layout

**Files:**
- Modify: `src/util/paths.ts`
- Modify: `tests/util/paths.test.ts`

- [ ] **Step 1: Write failing test**

Replace `tests/util/paths.test.ts` body with:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { configDir, stateDir, manifestFile, baseSnapshotName, lockFile } from "../../src/util/paths.js";

describe("paths", () => {
  beforeEach(() => {
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_STATE_HOME;
    process.env.HOME = "/tmp/fake-home";
  });

  it("configDir defaults to ~/.config/komora", () => {
    expect(configDir()).toBe("/tmp/fake-home/.config/komora");
  });

  it("manifestFile is configDir + box.yaml", () => {
    expect(manifestFile()).toBe("/tmp/fake-home/.config/komora/box.yaml");
  });

  it("baseSnapshotName is komora-base", () => {
    expect(baseSnapshotName()).toBe("komora-base");
  });

  it("lockFile composes stateDir + name", () => {
    expect(lockFile("foo")).toBe("/tmp/fake-home/.local/state/komora/locks/foo.lock");
  });

  it("XDG_CONFIG_HOME overrides", () => {
    process.env.XDG_CONFIG_HOME = "/custom";
    expect(configDir()).toBe("/custom/komora");
  });
});
```

- [ ] **Step 2: Run test to verify failures**

Run: `npm test -- tests/util/paths.test.ts`
Expected: FAIL — `manifestFile` / `baseSnapshotName` not exported.

- [ ] **Step 3: Update `src/util/paths.ts`**

Replace contents with:

```typescript
import path from "node:path";
import os from "node:os";

function home(): string {
  return process.env.HOME ?? os.homedir();
}

export function configDir(): string {
  const base = process.env.XDG_CONFIG_HOME ?? path.join(home(), ".config");
  return path.join(base, "komora");
}

export function stateDir(): string {
  const base = process.env.XDG_STATE_HOME ?? path.join(home(), ".local", "state");
  return path.join(base, "komora");
}

export function manifestFile(): string {
  return path.join(configDir(), "box.yaml");
}

export function secretsFile(): string {
  return path.join(configDir(), "secrets.json");
}

export function baseSnapshotName(): string {
  return "komora-base";
}

export function lockFile(name: string): string {
  return path.join(stateDir(), "locks", `${name}.lock`);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/util/paths.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/util/paths.ts tests/util/paths.test.ts
git commit -m "refactor(util/paths): replace workspace-era helpers with box manifest paths

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 1 — Manifest types, schema, load, resolve

### Task 1.1: Define box manifest types

**Files:**
- Create: `src/box/types.ts`
- Create: `tests/box/types.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/box/types.test.ts`:

```typescript
import { describe, it, expectTypeOf } from "vitest";
import type {
  BoxManifest,
  ResolvedBox,
  Mount,
  VolumeDecl,
  WorkloadSecret,
  IdentitySecret,
  NetworkPolicy,
  Toolchain,
  Feature,
  PersonalLayer,
} from "../../src/box/types.js";

describe("box types", () => {
  it("BoxManifest shape matches spec", () => {
    const m: BoxManifest = {
      version: 1,
      image: { base: "debian:12-slim", toolchains: [{ node: "22" }], agents: ["claude"], packages: ["tmux"] },
      box: {
        name: "komora-box",
        resources: { memoryMib: 8192, cpus: 4, diskGib: 64 },
        personalLayer: { volume: { name: "personal-layer", mount: "/home/komora/.local" } },
        volumes: [{ name: "claude-home", mount: "/home/komora/.claude" }],
        mounts: [{ host: "~/Projects", guest: "/home/komora/Projects" }],
        ports: [{ host: 2222, guest: 22 }],
        network: { policy: "nonlocal" },
        ssh: { enabled: true, user: "komora", authorizedKeysFromHost: "~/.ssh/id_ed25519.pub" },
        identity: { forwardSshAgent: true },
        features: { docker: false, clipboard: true },
      },
      secrets: {
        workload: [{ name: "ANTHROPIC_API_KEY", domain: "api.anthropic.com" }],
        identity: ["ssh-agent"],
      },
    };
    expectTypeOf(m).toMatchTypeOf<BoxManifest>();
  });

  it("ResolvedBox resolves ~ in paths", () => {
    expectTypeOf<ResolvedBox["mounts"][number]>().toMatchTypeOf<{ host: string; guest: string; readonly?: boolean }>();
  });

  it("PersonalLayer is volume OR mount, not both", () => {
    expectTypeOf<PersonalLayer>().toMatchTypeOf<
      | { volume: VolumeDecl; mount?: never }
      | { mount: Mount; volume?: never }
    >();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/box/types.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/box/types.ts`**

```typescript
export interface Toolchain {
  [name: string]: string;
}

export interface VolumeDecl {
  name: string;
  mount: string;
}

export interface Mount {
  host: string;
  guest: string;
  readonly?: boolean;
}

export interface PortForward {
  host: number;
  guest: number;
}

export interface NetworkPolicy {
  policy: "none" | "public-only" | "nonlocal" | "allow-all";
  denyDomainSuffix?: string[];
  tlsIntercept?: boolean;
}

export interface SshConfig {
  enabled: boolean;
  user: string;
  authorizedKeysFromHost: string;
}

export interface IdentityConfig {
  forwardSshAgent: boolean;
}

export interface FeatureFlags {
  docker?: boolean;
  clipboard?: boolean;
}

export interface Feature {
  name: string;
  enabled: boolean;
}

export interface Resources {
  memoryMib?: number;
  cpus?: number;
  diskGib?: number;
}

export interface ImageSection {
  base: string;
  toolchains?: Toolchain[];
  agents?: string[];
  packages?: string[];
}

export type PersonalLayer =
  | { volume: VolumeDecl; mount?: never }
  | { mount: Mount; volume?: never };

export interface BoxSection {
  name: string;
  resources?: Resources;
  personalLayer: PersonalLayer;
  volumes?: VolumeDecl[];
  mounts?: Mount[];
  ports?: PortForward[];
  network?: NetworkPolicy;
  ssh?: SshConfig;
  identity?: IdentityConfig;
  features?: FeatureFlags;
}

export interface WorkloadSecret {
  name: string;
  domain: string;
}

export type IdentitySecret = "ssh-agent";

export interface SecretsSection {
  workload?: WorkloadSecret[];
  identity?: IdentitySecret[];
}

export interface BoxManifest {
  version: 1;
  image: ImageSection;
  box: BoxSection;
  secrets?: SecretsSection;
}

export interface ResolvedBox {
  version: 1;
  image: Required<Pick<ImageSection, "base">> & {
    toolchains: Toolchain[];
    agents: string[];
    packages: string[];
  };
  box: {
    name: string;
    resources: Resources;
    personalLayer: PersonalLayer;
    volumes: VolumeDecl[];
    mounts: Mount[];
    ports: PortForward[];
    network: NetworkPolicy;
    ssh: SshConfig | null;
    identity: IdentityConfig;
    features: Required<FeatureFlags>;
  };
  secrets: {
    workload: WorkloadSecret[];
    identity: IdentitySecret[];
  };
  baseSnapshotName: string;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/box/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/box/types.ts tests/box/types.test.ts
git commit -m "feat(box): add manifest and resolved types

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 1.2: AJV schema for box.yaml

**Files:**
- Create: `src/box/schema.ts`
- Create: `tests/box/schema.test.ts`
- Create: `tests/fixtures/box/minimal.yaml`
- Create: `tests/fixtures/box/full.yaml`
- Create: `tests/fixtures/box/invalid-extra-key.yaml`
- Create: `tests/fixtures/box/invalid-workload-no-domain.yaml`
- Create: `tests/fixtures/box/invalid-both-personal.yaml`

- [ ] **Step 1: Create fixtures**

`tests/fixtures/box/minimal.yaml`:
```yaml
version: 1
image:
  base: debian:12-slim
box:
  name: komora-box
  personalLayer:
    volume: { name: personal-layer, mount: /home/komora/.local }
```

`tests/fixtures/box/full.yaml`:
```yaml
version: 1
image:
  base: debian:12-slim
  toolchains:
    - { node: "22" }
    - { python: "3.12" }
  agents: [claude, opencode]
  packages: [tmux, zsh]
box:
  name: komora-box
  resources: { memoryMib: 8192, cpus: 4, diskGib: 64 }
  personalLayer:
    volume: { name: personal-layer, mount: /home/komora/.local }
  volumes:
    - { name: claude-home, mount: /home/komora/.claude }
  mounts:
    - { host: ~/Projects, guest: /home/komora/Projects }
  ports:
    - { host: 2222, guest: 22 }
  network:
    policy: nonlocal
  ssh:
    enabled: true
    user: komora
    authorizedKeysFromHost: ~/.ssh/id_ed25519.pub
  identity:
    forwardSshAgent: true
  features:
    docker: false
    clipboard: true
secrets:
  workload:
    - { name: ANTHROPIC_API_KEY, domain: api.anthropic.com }
  identity: [ssh-agent]
```

`tests/fixtures/box/invalid-extra-key.yaml`:
```yaml
version: 1
image:
  base: debian:12-slim
box:
  name: komora-box
  personalLayer:
    volume: { name: personal-layer, mount: /home/komora/.local }
  unknownField: "this should be rejected"
```

`tests/fixtures/box/invalid-workload-no-domain.yaml`:
```yaml
version: 1
image:
  base: debian:12-slim
box:
  name: komora-box
  personalLayer:
    volume: { name: personal-layer, mount: /home/komora/.local }
secrets:
  workload:
    - { name: OPENAI_API_KEY }
```

`tests/fixtures/box/invalid-both-personal.yaml`:
```yaml
version: 1
image:
  base: debian:12-slim
box:
  name: komora-box
  personalLayer:
    volume: { name: personal-layer, mount: /home/komora/.local }
    mount:  { host: ~/dotfiles, guest: /home/komora/.local }
```

- [ ] **Step 2: Write failing test**

`tests/box/schema.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { validateBoxManifest } from "../../src/box/schema.js";

const load = (name: string) => yaml.load(readFileSync(`tests/fixtures/box/${name}`, "utf8"));

describe("box schema", () => {
  it("accepts minimal manifest", () => {
    expect(() => validateBoxManifest(load("minimal.yaml"))).not.toThrow();
  });

  it("accepts full manifest", () => {
    expect(() => validateBoxManifest(load("full.yaml"))).not.toThrow();
  });

  it("rejects unknown top-level key", () => {
    expect(() => validateBoxManifest(load("invalid-extra-key.yaml"))).toThrow(/unknownField|additional/);
  });

  it("rejects workload secret without domain", () => {
    expect(() => validateBoxManifest(load("invalid-workload-no-domain.yaml"))).toThrow(/domain/);
  });

  it("rejects personalLayer with both volume and mount", () => {
    expect(() => validateBoxManifest(load("invalid-both-personal.yaml"))).toThrow(/oneOf|exactly one|matching/);
  });

  it("rejects missing version", () => {
    expect(() => validateBoxManifest({ image: { base: "x" }, box: { name: "y", personalLayer: { volume: { name: "p", mount: "/x" } } } })).toThrow(/version/);
  });

  it("rejects volume name with uppercase", () => {
    const data = load("minimal.yaml") as any;
    data.box.personalLayer.volume.name = "BadName";
    expect(() => validateBoxManifest(data)).toThrow(/pattern|name/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/box/schema.test.ts`
Expected: FAIL — `src/box/schema.ts` not found.

- [ ] **Step 4: Create `src/box/schema.ts`**

```typescript
import Ajv from "ajv";

const ajv = new Ajv({ allErrors: true, strict: false });

const volumeName = { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" };

const volumeDecl = {
  type: "object",
  properties: {
    name: volumeName,
    mount: { type: "string" },
  },
  required: ["name", "mount"],
  additionalProperties: false,
};

const mount = {
  type: "object",
  properties: {
    host: { type: "string" },
    guest: { type: "string" },
    readonly: { type: "boolean" },
  },
  required: ["host", "guest"],
  additionalProperties: false,
};

const portForward = {
  type: "object",
  properties: {
    host: { type: "integer", minimum: 1, maximum: 65535 },
    guest: { type: "integer", minimum: 1, maximum: 65535 },
  },
  required: ["host", "guest"],
  additionalProperties: false,
};

const toolchainEntry = {
  type: "object",
  minProperties: 1,
  maxProperties: 1,
  patternProperties: { "^[a-z]+$": { type: "string" } },
  additionalProperties: false,
};

const personalLayer = {
  type: "object",
  oneOf: [
    { properties: { volume: volumeDecl }, required: ["volume"], additionalProperties: false },
    { properties: { mount: mount }, required: ["mount"], additionalProperties: false },
  ],
};

const workloadSecret = {
  type: "object",
  properties: {
    name: { type: "string", pattern: "^[A-Z_][A-Z0-9_]*$" },
    domain: { type: "string", minLength: 1 },
  },
  required: ["name", "domain"],
  additionalProperties: false,
};

const network = {
  type: "object",
  properties: {
    policy: { type: "string", enum: ["none", "public-only", "nonlocal", "allow-all"] },
    denyDomainSuffix: { type: "array", items: { type: "string" } },
    tlsIntercept: { type: "boolean" },
  },
  required: ["policy"],
  additionalProperties: false,
};

const ssh = {
  type: "object",
  properties: {
    enabled: { type: "boolean" },
    user: { type: "string", pattern: "^[a-z_][a-z0-9_-]*$" },
    authorizedKeysFromHost: { type: "string" },
  },
  required: ["enabled", "user", "authorizedKeysFromHost"],
  additionalProperties: false,
};

const manifestSchema = {
  type: "object",
  properties: {
    version: { const: 1 },
    image: {
      type: "object",
      properties: {
        base: { type: "string", minLength: 1 },
        toolchains: { type: "array", items: toolchainEntry },
        agents: { type: "array", items: { type: "string", pattern: "^[a-z][a-z0-9-]*$" } },
        packages: { type: "array", items: { type: "string" } },
      },
      required: ["base"],
      additionalProperties: false,
    },
    box: {
      type: "object",
      properties: {
        name: { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
        resources: {
          type: "object",
          properties: {
            memoryMib: { type: "integer", minimum: 256 },
            cpus: { type: "integer", minimum: 1 },
            diskGib: { type: "integer", minimum: 1 },
          },
          additionalProperties: false,
        },
        personalLayer,
        volumes: { type: "array", items: volumeDecl },
        mounts: { type: "array", items: mount },
        ports: { type: "array", items: portForward },
        network,
        ssh,
        identity: {
          type: "object",
          properties: { forwardSshAgent: { type: "boolean" } },
          required: ["forwardSshAgent"],
          additionalProperties: false,
        },
        features: {
          type: "object",
          properties: { docker: { type: "boolean" }, clipboard: { type: "boolean" } },
          additionalProperties: false,
        },
      },
      required: ["name", "personalLayer"],
      additionalProperties: false,
    },
    secrets: {
      type: "object",
      properties: {
        workload: { type: "array", items: workloadSecret },
        identity: { type: "array", items: { const: "ssh-agent" } },
      },
      additionalProperties: false,
    },
  },
  required: ["version", "image", "box"],
  additionalProperties: false,
};

const validate = ajv.compile(manifestSchema);

export function validateBoxManifest(data: unknown): void {
  if (!validate(data)) {
    const msg = validate.errors!.map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ");
    throw new Error(`invalid box.yaml: ${msg}`);
  }
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test -- tests/box/schema.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/box/schema.ts tests/box/schema.test.ts tests/fixtures/box/
git commit -m "feat(box): add AJV schema for box.yaml with strict additionalProperties

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 1.3: Load `box.yaml`

**Files:**
- Create: `src/box/load.ts`
- Create: `tests/box/load.test.ts`

- [ ] **Step 1: Write failing test**

`tests/box/load.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadManifest } from "../../src/box/load.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "komora-load-"));
});

describe("loadManifest", () => {
  it("loads and parses a YAML file", async () => {
    const p = path.join(tmp, "box.yaml");
    writeFileSync(p, `version: 1\nimage: { base: debian:12-slim }\nbox: { name: komora-box, personalLayer: { volume: { name: pl, mount: /x } } }\n`);
    const m = await loadManifest(p);
    expect(m.box.name).toBe("komora-box");
  });

  it("throws when file is missing", async () => {
    await expect(loadManifest(path.join(tmp, "absent.yaml"))).rejects.toThrow(/not found/);
  });

  it("throws when YAML is malformed", async () => {
    const p = path.join(tmp, "bad.yaml");
    writeFileSync(p, "version: 1\n  - this isn't valid\n");
    await expect(loadManifest(p)).rejects.toThrow(/parse/i);
  });

  it("throws when schema validation fails", async () => {
    const p = path.join(tmp, "schema-bad.yaml");
    writeFileSync(p, `version: 1\nbox: { name: x }\n`);
    await expect(loadManifest(p)).rejects.toThrow(/invalid box.yaml/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/box/load.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/box/load.ts`**

```typescript
import { readFile } from "node:fs/promises";
import yaml from "js-yaml";
import { validateBoxManifest } from "./schema.js";
import type { BoxManifest } from "./types.js";

export async function loadManifest(filePath: string): Promise<BoxManifest> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (e: any) {
    if (e?.code === "ENOENT") {
      throw new Error(`box.yaml not found: ${filePath}`);
    }
    throw e;
  }

  let data: unknown;
  try {
    data = yaml.load(text);
  } catch (e: any) {
    throw new Error(`failed to parse ${filePath}: ${e?.message ?? e}`);
  }

  validateBoxManifest(data);
  return data as BoxManifest;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/box/load.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/box/load.ts tests/box/load.test.ts
git commit -m "feat(box): add loadManifest reading box.yaml from disk

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 1.4: Resolve manifest into `ResolvedBox`

**Files:**
- Create: `src/box/resolve.ts`
- Create: `tests/box/resolve.test.ts`

- [ ] **Step 1: Write failing test**

`tests/box/resolve.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { resolveManifest } from "../../src/box/resolve.js";
import type { BoxManifest } from "../../src/box/types.js";

beforeEach(() => {
  process.env.HOME = "/home/u";
});

const base: BoxManifest = {
  version: 1,
  image: { base: "debian:12-slim" },
  box: {
    name: "komora-box",
    personalLayer: { volume: { name: "personal-layer", mount: "/home/komora/.local" } },
  },
};

describe("resolveManifest", () => {
  it("fills defaults for image arrays", () => {
    const r = resolveManifest(base);
    expect(r.image.toolchains).toEqual([]);
    expect(r.image.agents).toEqual([]);
    expect(r.image.packages).toEqual([]);
  });

  it("defaults box.network to nonlocal policy", () => {
    const r = resolveManifest(base);
    expect(r.box.network).toEqual({ policy: "nonlocal" });
  });

  it("defaults identity.forwardSshAgent to false when absent", () => {
    const r = resolveManifest(base);
    expect(r.box.identity).toEqual({ forwardSshAgent: false });
  });

  it("defaults features to all-false", () => {
    const r = resolveManifest(base);
    expect(r.box.features).toEqual({ docker: false, clipboard: false });
  });

  it("expands ~ in mount.host paths", () => {
    const m: BoxManifest = {
      ...base,
      box: { ...base.box, mounts: [{ host: "~/Projects", guest: "/x" }] },
    };
    expect(resolveManifest(m).box.mounts[0].host).toBe("/home/u/Projects");
  });

  it("expands ~ in personalLayer.mount.host", () => {
    const m: BoxManifest = {
      ...base,
      box: { ...base.box, personalLayer: { mount: { host: "~/dot", guest: "/home/komora/.local" } } },
    };
    const r = resolveManifest(m);
    if ("mount" in r.box.personalLayer) {
      expect(r.box.personalLayer.mount.host).toBe("/home/u/dot");
    }
  });

  it("expands ~ in ssh.authorizedKeysFromHost", () => {
    const m: BoxManifest = {
      ...base,
      box: { ...base.box, ssh: { enabled: true, user: "komora", authorizedKeysFromHost: "~/.ssh/id_ed25519.pub" } },
    };
    expect(resolveManifest(m).box.ssh!.authorizedKeysFromHost).toBe("/home/u/.ssh/id_ed25519.pub");
  });

  it("sets baseSnapshotName", () => {
    expect(resolveManifest(base).baseSnapshotName).toBe("komora-base");
  });

  it("preserves workload secrets verbatim", () => {
    const m: BoxManifest = {
      ...base,
      secrets: { workload: [{ name: "FOO", domain: "api.foo.com" }] },
    };
    expect(resolveManifest(m).secrets.workload).toEqual([{ name: "FOO", domain: "api.foo.com" }]);
  });

  it("defaults secrets sections to empty arrays", () => {
    expect(resolveManifest(base).secrets).toEqual({ workload: [], identity: [] });
  });

  it("sets ssh to null when section absent", () => {
    expect(resolveManifest(base).box.ssh).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/box/resolve.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/box/resolve.ts`**

```typescript
import path from "node:path";
import os from "node:os";
import { baseSnapshotName } from "../util/paths.js";
import type {
  BoxManifest,
  ResolvedBox,
  Mount,
  PersonalLayer,
} from "./types.js";

function home(): string {
  return process.env.HOME ?? os.homedir();
}

function expandTilde(p: string): string {
  if (p === "~") return home();
  if (p.startsWith("~/")) return path.join(home(), p.slice(2));
  return p;
}

function resolveMount(m: Mount): Mount {
  return { ...m, host: expandTilde(m.host) };
}

function resolvePersonalLayer(pl: PersonalLayer): PersonalLayer {
  if ("mount" in pl && pl.mount) {
    return { mount: resolveMount(pl.mount) };
  }
  return { volume: pl.volume! };
}

export function resolveManifest(m: BoxManifest): ResolvedBox {
  const ssh = m.box.ssh
    ? { ...m.box.ssh, authorizedKeysFromHost: expandTilde(m.box.ssh.authorizedKeysFromHost) }
    : null;

  return {
    version: 1,
    image: {
      base: m.image.base,
      toolchains: m.image.toolchains ?? [],
      agents: m.image.agents ?? [],
      packages: m.image.packages ?? [],
    },
    box: {
      name: m.box.name,
      resources: m.box.resources ?? {},
      personalLayer: resolvePersonalLayer(m.box.personalLayer),
      volumes: m.box.volumes ?? [],
      mounts: (m.box.mounts ?? []).map(resolveMount),
      ports: m.box.ports ?? [],
      network: m.box.network ?? { policy: "nonlocal" },
      ssh,
      identity: m.box.identity ?? { forwardSshAgent: false },
      features: {
        docker: m.box.features?.docker ?? false,
        clipboard: m.box.features?.clipboard ?? false,
      },
    },
    secrets: {
      workload: m.secrets?.workload ?? [],
      identity: m.secrets?.identity ?? [],
    },
    baseSnapshotName: baseSnapshotName(),
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/box/resolve.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/box/resolve.ts tests/box/resolve.test.ts
git commit -m "feat(box): resolve manifest into ResolvedBox with defaults + ~ expansion

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 1.5: Entry point `loadBox()`

**Files:**
- Create: `src/box/index.ts`
- Create: `tests/box/index.test.ts`

- [ ] **Step 1: Write failing test**

`tests/box/index.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadBox } from "../../src/box/index.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "komora-loadbox-"));
  process.env.HOME = tmp;
  process.env.XDG_CONFIG_HOME = path.join(tmp, ".config");
});

describe("loadBox", () => {
  it("reads from default manifest path", async () => {
    const dir = path.join(tmp, ".config", "komora");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, "box.yaml"),
      `version: 1\nimage: { base: debian:12-slim }\nbox: { name: komora-box, personalLayer: { volume: { name: pl, mount: /home/k/.local } } }\n`,
    );
    const r = await loadBox();
    expect(r.box.name).toBe("komora-box");
    expect(r.image.toolchains).toEqual([]);
  });

  it("accepts an explicit path override", async () => {
    const p = path.join(tmp, "elsewhere.yaml");
    writeFileSync(
      p,
      `version: 1\nimage: { base: debian:12-slim }\nbox: { name: kb2, personalLayer: { volume: { name: pl, mount: /x } } }\n`,
    );
    const r = await loadBox(p);
    expect(r.box.name).toBe("kb2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/box/index.test.ts`
Expected: FAIL

- [ ] **Step 3: Create `src/box/index.ts`**

```typescript
import { loadManifest } from "./load.js";
import { resolveManifest } from "./resolve.js";
import { manifestFile } from "../util/paths.js";
import type { ResolvedBox } from "./types.js";

export type { BoxManifest, ResolvedBox } from "./types.js";

export async function loadBox(filePath?: string): Promise<ResolvedBox> {
  const p = filePath ?? manifestFile();
  const m = await loadManifest(p);
  return resolveManifest(m);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/box/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/box/index.ts tests/box/index.test.ts
git commit -m "feat(box): expose loadBox() entry point

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 2 — Secrets (tiered)

### Task 2.1: Keychain wrapper (libsecret + file fallback)

**Files:**
- Create: `src/secrets/keychain.ts`
- Create: `tests/secrets/keychain.test.ts`
- Modify: `package.json` (add `keytar` dependency — but conditional; see below)

We use a file-backed store at `~/.config/komora/secrets.json` mode 0600 as the only v1 backend. libsecret integration is deferred to a followup (noted in the design as still being valuable but not strictly required when `secretEnv` keeps values out of the VM).

- [ ] **Step 1: Write failing test**

`tests/secrets/keychain.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setSecret, getSecret, listSecrets, removeSecret } from "../../src/secrets/keychain.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "komora-kc-"));
  process.env.HOME = tmp;
  process.env.XDG_CONFIG_HOME = path.join(tmp, ".config");
});

describe("keychain (file store)", () => {
  it("setSecret/getSecret round-trips", async () => {
    await setSecret("ANTHROPIC_API_KEY", "sk-abc");
    expect(await getSecret("ANTHROPIC_API_KEY")).toBe("sk-abc");
  });

  it("getSecret returns undefined for unknown name", async () => {
    expect(await getSecret("MISSING")).toBeUndefined();
  });

  it("listSecrets returns names only", async () => {
    await setSecret("A", "1");
    await setSecret("B", "2");
    expect((await listSecrets()).sort()).toEqual(["A", "B"]);
  });

  it("removeSecret deletes a key", async () => {
    await setSecret("X", "1");
    await removeSecret("X");
    expect(await getSecret("X")).toBeUndefined();
  });

  it("writes the store file with mode 0600", async () => {
    await setSecret("X", "1");
    const file = path.join(tmp, ".config", "komora", "secrets.json");
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("tolerates a missing store file on read", async () => {
    expect(await listSecrets()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/secrets/keychain.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/secrets/keychain.ts`**

```typescript
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import path from "node:path";
import { secretsFile, configDir } from "../util/paths.js";

interface Store {
  [name: string]: string;
}

async function readStore(): Promise<Store> {
  try {
    const text = await readFile(secretsFile(), "utf8");
    return JSON.parse(text) as Store;
  } catch (e: any) {
    if (e?.code === "ENOENT") return {};
    throw e;
  }
}

async function writeStore(s: Store): Promise<void> {
  await mkdir(configDir(), { recursive: true });
  const tmp = secretsFile() + ".tmp";
  await writeFile(tmp, JSON.stringify(s, null, 2), { mode: 0o600 });
  await chmod(tmp, 0o600);
  const { rename } = await import("node:fs/promises");
  await rename(tmp, secretsFile());
  await chmod(secretsFile(), 0o600);
}

export async function setSecret(name: string, value: string): Promise<void> {
  const s = await readStore();
  s[name] = value;
  await writeStore(s);
}

export async function getSecret(name: string): Promise<string | undefined> {
  const s = await readStore();
  return s[name];
}

export async function listSecrets(): Promise<string[]> {
  return Object.keys(await readStore());
}

export async function removeSecret(name: string): Promise<void> {
  const s = await readStore();
  delete s[name];
  await writeStore(s);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/secrets/keychain.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/secrets/keychain.ts tests/secrets/keychain.test.ts
git commit -m "feat(secrets): add file-backed keychain with 0600 perms

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 2.2: Tier classification

**Files:**
- Create: `src/secrets/tiers.ts`
- Create: `tests/secrets/tiers.test.ts`

- [ ] **Step 1: Write failing test**

`tests/secrets/tiers.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { classify, hasWorkload, hasSshAgent } from "../../src/secrets/tiers.js";
import type { ResolvedBox } from "../../src/box/types.js";

const make = (workload: any[] = [], identity: any[] = []): ResolvedBox =>
  ({
    secrets: { workload, identity },
  } as unknown as ResolvedBox);

describe("tiers", () => {
  it("classify returns separate workload and identity arrays", () => {
    const r = classify(make([{ name: "A", domain: "api.a.com" }], ["ssh-agent"]));
    expect(r.workload).toEqual([{ name: "A", domain: "api.a.com" }]);
    expect(r.identity).toEqual(["ssh-agent"]);
  });

  it("hasWorkload reports presence", () => {
    expect(hasWorkload(make([], []))).toBe(false);
    expect(hasWorkload(make([{ name: "A", domain: "x" }]))).toBe(true);
  });

  it("hasSshAgent reports ssh-agent forwarding need", () => {
    expect(hasSshAgent(make([], []))).toBe(false);
    expect(hasSshAgent(make([], ["ssh-agent"]))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/secrets/tiers.test.ts`
Expected: FAIL

- [ ] **Step 3: Create `src/secrets/tiers.ts`**

```typescript
import type { ResolvedBox, WorkloadSecret, IdentitySecret } from "../box/types.js";

export interface Tiers {
  workload: WorkloadSecret[];
  identity: IdentitySecret[];
}

export function classify(r: ResolvedBox): Tiers {
  return { workload: r.secrets.workload, identity: r.secrets.identity };
}

export function hasWorkload(r: ResolvedBox): boolean {
  return r.secrets.workload.length > 0;
}

export function hasSshAgent(r: ResolvedBox): boolean {
  return r.secrets.identity.includes("ssh-agent");
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/secrets/tiers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/secrets/tiers.ts tests/secrets/tiers.test.ts
git commit -m "feat(secrets): classify workload vs identity tiers

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 2.3: Inject workload secrets into msb builder

**Files:**
- Create: `src/secrets/inject.ts`
- Create: `tests/secrets/inject.test.ts`

- [ ] **Step 1: Write failing test**

`tests/secrets/inject.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectWorkloadValues, missingWorkload, buildSecretEnvArgs } from "../../src/secrets/inject.js";
import { setSecret } from "../../src/secrets/keychain.js";
import type { WorkloadSecret } from "../../src/box/types.js";

beforeEach(() => {
  const tmp = mkdtempSync(path.join(tmpdir(), "komora-inj-"));
  process.env.HOME = tmp;
  process.env.XDG_CONFIG_HOME = path.join(tmp, ".config");
});

describe("inject", () => {
  it("collectWorkloadValues returns only keys present in keychain", async () => {
    await setSecret("PRESENT", "sk-abc");
    const w: WorkloadSecret[] = [
      { name: "PRESENT", domain: "api.foo.com" },
      { name: "ABSENT", domain: "api.bar.com" },
    ];
    expect(await collectWorkloadValues(w)).toEqual({ PRESENT: { value: "sk-abc", domain: "api.foo.com" } });
  });

  it("missingWorkload returns names not in keychain", async () => {
    await setSecret("PRESENT", "x");
    const w: WorkloadSecret[] = [
      { name: "PRESENT", domain: "a" },
      { name: "ABSENT", domain: "b" },
    ];
    expect(await missingWorkload(w)).toEqual(["ABSENT"]);
  });

  it("buildSecretEnvArgs produces NAME=VALUE@HOST tuples", () => {
    const got = buildSecretEnvArgs({
      A: { value: "1", domain: "api.a.com" },
      B: { value: "2", domain: "api.b.com" },
    });
    expect(got).toEqual([
      "--secret", "A=1@api.a.com",
      "--secret", "B=2@api.b.com",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/secrets/inject.test.ts`
Expected: FAIL

- [ ] **Step 3: Create `src/secrets/inject.ts`**

```typescript
import { getSecret } from "./keychain.js";
import type { WorkloadSecret } from "../box/types.js";

export interface ResolvedWorkload {
  [name: string]: { value: string; domain: string };
}

export async function collectWorkloadValues(workload: WorkloadSecret[]): Promise<ResolvedWorkload> {
  const out: ResolvedWorkload = {};
  for (const w of workload) {
    const v = await getSecret(w.name);
    if (v !== undefined) out[w.name] = { value: v, domain: w.domain };
  }
  return out;
}

export async function missingWorkload(workload: WorkloadSecret[]): Promise<string[]> {
  const out: string[] = [];
  for (const w of workload) {
    if ((await getSecret(w.name)) === undefined) out.push(w.name);
  }
  return out;
}

export function buildSecretEnvArgs(values: ResolvedWorkload): string[] {
  const args: string[] = [];
  for (const [name, { value, domain }] of Object.entries(values)) {
    args.push("--secret", `${name}=${value}@${domain}`);
  }
  return args;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/secrets/inject.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/secrets/inject.ts tests/secrets/inject.test.ts
git commit -m "feat(secrets): inject workload secrets as secretEnv args

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 3 — Backend (msb wrappers)

### Task 3.1: SDK wrapper

**Files:**
- Create: `src/box/backend/sdk.ts`
- Create: `tests/box/backend/sdk.test.ts`

Builds the microsandbox SDK builder from a `ResolvedBox` + secret args. This is mostly mechanical translation; tests verify the builder calls happen in the right order with the right args using vi.mock against the SDK.

- [ ] **Step 1: Write failing test**

`tests/box/backend/sdk.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: string[] = [];
const builder = {
  image: vi.fn(() => builder),
  memory: vi.fn(() => builder),
  cpus: vi.fn(() => builder),
  env: vi.fn(() => builder),
  volume: vi.fn(() => builder),
  secret: vi.fn(() => builder),
  secretEnv: vi.fn(() => builder),
  network: vi.fn(() => builder),
  create: vi.fn(async () => ({ name: "stub" })),
};

vi.mock("microsandbox", () => ({
  Sandbox: { builder: vi.fn(() => builder) },
  Volume: { builder: vi.fn(() => ({ create: vi.fn() })) },
  VolumeAlreadyExistsError: class extends Error {},
  SandboxNotFoundError: class extends Error {},
}));

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
});

import { buildSandbox } from "../../../src/box/backend/sdk.js";
import type { ResolvedBox } from "../../../src/box/types.js";

const baseResolved: ResolvedBox = {
  version: 1,
  image: { base: "snap:komora-base", toolchains: [], agents: [], packages: [] },
  box: {
    name: "komora-box",
    resources: { memoryMib: 4096, cpus: 2 },
    personalLayer: { volume: { name: "pl", mount: "/home/k/.local" } },
    volumes: [],
    mounts: [],
    ports: [],
    network: { policy: "nonlocal" },
    ssh: null,
    identity: { forwardSshAgent: false },
    features: { docker: false, clipboard: false },
  },
  secrets: { workload: [], identity: [] },
  baseSnapshotName: "komora-base",
};

describe("buildSandbox", () => {
  it("applies image, memory, cpus", async () => {
    await buildSandbox(baseResolved, { secretArgs: [] });
    expect(builder.image).toHaveBeenCalledWith("snap:komora-base");
    expect(builder.memory).toHaveBeenCalledWith(4096);
    expect(builder.cpus).toHaveBeenCalledWith(2);
  });

  it("mounts the personal layer (volume form)", async () => {
    await buildSandbox(baseResolved, { secretArgs: [] });
    expect(builder.volume).toHaveBeenCalled();
  });

  it("converts secretEnv args into builder.secretEnv calls", async () => {
    await buildSandbox(baseResolved, { secretArgs: ["--secret", "FOO=bar@api.foo.com"] });
    expect(builder.secretEnv).toHaveBeenCalledWith("MSB_FOO", "bar", "api.foo.com");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/box/backend/sdk.test.ts`
Expected: FAIL

- [ ] **Step 3: Create `src/box/backend/sdk.ts`**

```typescript
import { Sandbox, Volume, VolumeAlreadyExistsError } from "microsandbox";
import type { ResolvedBox, Mount, VolumeDecl } from "../types.js";

export interface BuildOpts {
  secretArgs: string[];
}

function parseSecret(args: string[]): Array<{ name: string; value: string; host: string }> {
  const out: Array<{ name: string; value: string; host: string }> = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== "--secret") continue;
    const p = args[i + 1];
    i++;
    const eq = p.indexOf("=");
    const at = p.indexOf("@", eq);
    if (eq < 0 || at < 0) throw new Error(`bad secret arg: ${p}`);
    out.push({ name: p.slice(0, eq), value: p.slice(eq + 1, at), host: p.slice(at + 1) });
  }
  return out;
}

async function ensureVolume(name: string): Promise<void> {
  try {
    await Volume.builder(name).create();
  } catch (e) {
    if (!(e instanceof VolumeAlreadyExistsError)) throw e;
  }
}

export async function buildSandbox(r: ResolvedBox, opts: BuildOpts): Promise<Sandbox> {
  let b = Sandbox.builder(r.box.name).image(r.image.base);

  if (r.box.resources.memoryMib) b = b.memory(r.box.resources.memoryMib);
  if (r.box.resources.cpus) b = b.cpus(r.box.resources.cpus);

  // personalLayer
  if ("volume" in r.box.personalLayer && r.box.personalLayer.volume) {
    const v = r.box.personalLayer.volume;
    await ensureVolume(v.name);
    b = b.volume(v.mount, (vb: any) => vb.named(v.name));
  } else if ("mount" in r.box.personalLayer && r.box.personalLayer.mount) {
    const m = r.box.personalLayer.mount;
    b = b.volume(m.guest, (vb: any) => vb.bind(m.host));
  }

  // named volumes
  for (const v of r.box.volumes) {
    await ensureVolume(v.name);
    b = b.volume(v.mount, (vb: any) => vb.named(v.name));
  }

  // bind mounts
  for (const m of r.box.mounts) {
    b = b.volume(m.guest, (vb: any) => vb.bind(m.host));
  }

  // workload secrets
  for (const s of parseSecret(opts.secretArgs)) {
    b = b.secretEnv(`MSB_${s.name}`, s.value, s.host);
  }

  return b.create();
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/box/backend/sdk.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/box/backend/sdk.ts tests/box/backend/sdk.test.ts
git commit -m "feat(box/backend): build microsandbox sandbox from ResolvedBox

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 3.2: msb CLI wrapper

**Files:**
- Create: `src/box/backend/msb.ts`
- Create: `tests/box/backend/msb.test.ts`

`msb.ts` is a thin shell-out helper for ops that need streaming (`logs`, `bake`, `attach`) where the SDK is overkill. Tests verify command shape only (using vi.mock against `node:child_process`).

- [ ] **Step 1: Write failing test**

`tests/box/backend/msb.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({ spawn: spawnMock }));

import { runMsb } from "../../../src/box/backend/msb.js";

beforeEach(() => { spawnMock.mockReset(); });

describe("msb wrapper", () => {
  it("spawns msb with args and inherits stdio by default", async () => {
    spawnMock.mockReturnValue({ on: (ev: string, cb: any) => { if (ev === "exit") cb(0); }, killed: false });
    await runMsb(["logs", "komora-box"]);
    expect(spawnMock).toHaveBeenCalledWith("msb", ["logs", "komora-box"], expect.objectContaining({ stdio: "inherit" }));
  });

  it("throws on non-zero exit", async () => {
    spawnMock.mockReturnValue({ on: (ev: string, cb: any) => { if (ev === "exit") cb(2); }, killed: false });
    await expect(runMsb(["x"])).rejects.toThrow(/exited with code 2/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/box/backend/msb.test.ts`
Expected: FAIL

- [ ] **Step 3: Create `src/box/backend/msb.ts`**

```typescript
import { spawn } from "node:child_process";

export interface MsbOpts {
  stdio?: "inherit" | "pipe";
  env?: NodeJS.ProcessEnv;
}

export async function runMsb(args: string[], opts: MsbOpts = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("msb", args, {
      stdio: opts.stdio ?? "inherit",
      env: opts.env ?? process.env,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`msb exited with code ${code}`));
    });
    child.on("error", reject);
  });
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/box/backend/msb.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/box/backend/msb.ts tests/box/backend/msb.test.ts
git commit -m "feat(box/backend): add msb CLI wrapper for streaming ops

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 3.3: Status

**Files:**
- Create: `src/box/backend/status.ts`
- Create: `tests/box/backend/status.test.ts`

- [ ] **Step 1: Write failing test**

`tests/box/backend/status.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const listMock = vi.fn();

vi.mock("microsandbox", () => ({
  Sandbox: { list: listMock, get: vi.fn() },
}));

import { boxStatus } from "../../../src/box/backend/status.js";

beforeEach(() => listMock.mockReset());

describe("boxStatus", () => {
  it("returns 'missing' when sandbox is not listed", async () => {
    listMock.mockResolvedValue([]);
    expect(await boxStatus("komora-box")).toBe("missing");
  });

  it("returns 'running' when listed and status running", async () => {
    listMock.mockResolvedValue([{ name: "komora-box", status: "running" }]);
    expect(await boxStatus("komora-box")).toBe("running");
  });

  it("returns 'stopped' when listed and status stopped/crashed/draining", async () => {
    for (const s of ["stopped", "crashed", "draining"]) {
      listMock.mockResolvedValue([{ name: "komora-box", status: s }]);
      expect(await boxStatus("komora-box")).toBe("stopped");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/box/backend/status.test.ts`
Expected: FAIL

- [ ] **Step 3: Create `src/box/backend/status.ts`**

```typescript
import { Sandbox } from "microsandbox";

export type BoxState = "missing" | "running" | "stopped";

export async function boxStatus(name: string): Promise<BoxState> {
  const handles = await Sandbox.list();
  const found = handles.find((h: any) => h.name === name);
  if (!found) return "missing";
  if (found.status === "running") return "running";
  return "stopped";
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/box/backend/status.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/box/backend/status.ts tests/box/backend/status.test.ts
git commit -m "feat(box/backend): add boxStatus probe

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 3.4: Lifecycle (up, down, pause, resume, destroy)

**Files:**
- Create: `src/box/backend/lifecycle.ts`
- Create: `tests/box/backend/lifecycle.test.ts`

- [ ] **Step 1: Write failing test**

`tests/box/backend/lifecycle.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const handle = {
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  remove: vi.fn(),
};
const getMock = vi.fn(async () => handle);

vi.mock("microsandbox", () => ({
  Sandbox: { get: getMock, start: vi.fn(async () => handle), remove: vi.fn() },
  SandboxNotFoundError: class extends Error {},
}));

import { up, down, pause, resume, destroy } from "../../../src/box/backend/lifecycle.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("lifecycle", () => {
  it("up calls Sandbox.start", async () => {
    await up("komora-box");
    expect((await import("microsandbox")).Sandbox.start).toHaveBeenCalledWith("komora-box");
  });

  it("down calls handle.stop", async () => {
    await down("komora-box");
    expect(handle.stop).toHaveBeenCalled();
  });

  it("pause calls handle.pause", async () => {
    await pause("komora-box");
    expect(handle.pause).toHaveBeenCalled();
  });

  it("resume calls handle.resume", async () => {
    await resume("komora-box");
    expect(handle.resume).toHaveBeenCalled();
  });

  it("destroy calls Sandbox.remove", async () => {
    await destroy("komora-box");
    expect((await import("microsandbox")).Sandbox.remove).toHaveBeenCalledWith("komora-box");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/box/backend/lifecycle.test.ts`
Expected: FAIL

- [ ] **Step 3: Create `src/box/backend/lifecycle.ts`**

```typescript
import { Sandbox, SandboxNotFoundError } from "microsandbox";

export async function up(name: string): Promise<void> {
  await Sandbox.start(name);
}

export async function down(name: string): Promise<void> {
  try {
    const h = await Sandbox.get(name);
    await (h as any).stop();
  } catch (e) {
    if (e instanceof SandboxNotFoundError) return;
    throw e;
  }
}

export async function pause(name: string): Promise<void> {
  const h = await Sandbox.get(name);
  await (h as any).pause();
}

export async function resume(name: string): Promise<void> {
  const h = await Sandbox.get(name);
  await (h as any).resume();
}

export async function destroy(name: string): Promise<void> {
  try {
    await Sandbox.remove(name);
  } catch (e) {
    if (e instanceof SandboxNotFoundError) return;
    throw e;
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/box/backend/lifecycle.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/box/backend/lifecycle.ts tests/box/backend/lifecycle.test.ts
git commit -m "feat(box/backend): add up/down/pause/resume/destroy

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 3.5: SSH readiness + host key pinning

**Files:**
- Create: `src/box/backend/ssh.ts`
- Create: `tests/box/backend/ssh.test.ts`

- [ ] **Step 1: Write failing test**

`tests/box/backend/ssh.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";

const connectMock = vi.fn();
vi.mock("node:net", () => ({
  createConnection: connectMock,
}));

import { probeSshd } from "../../../src/box/backend/ssh.js";

describe("probeSshd", () => {
  it("resolves true if connection emits ready", async () => {
    connectMock.mockImplementation(() => {
      const handlers: Record<string, any> = {};
      return {
        on: (ev: string, cb: any) => { handlers[ev] = cb; return this; },
        once: (ev: string, cb: any) => { handlers[ev] = cb; if (ev === "connect") setTimeout(cb, 0); },
        end: vi.fn(),
        destroy: vi.fn(),
        setTimeout: vi.fn(),
      };
    });
    await expect(probeSshd(2222, 100)).resolves.toBe(true);
  });

  it("resolves false on connection error", async () => {
    connectMock.mockImplementation(() => ({
      on: vi.fn(),
      once: (ev: string, cb: any) => { if (ev === "error") setTimeout(() => cb(new Error("ECONNREFUSED")), 0); },
      end: vi.fn(),
      destroy: vi.fn(),
      setTimeout: vi.fn(),
    }));
    await expect(probeSshd(2222, 100)).resolves.toBe(false);
  });

  it("resolves false after timeout", async () => {
    connectMock.mockImplementation(() => ({
      on: vi.fn(),
      once: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
      setTimeout: (_: number, cb: any) => { setTimeout(cb, 0); },
    }));
    await expect(probeSshd(2222, 50)).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/box/backend/ssh.test.ts`
Expected: FAIL

- [ ] **Step 3: Create `src/box/backend/ssh.ts`**

```typescript
import { createConnection } from "node:net";

export async function probeSshd(port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection(port, "127.0.0.1");
    sock.setTimeout(timeoutMs, () => { sock.destroy(); resolve(false); });
    sock.once("connect", () => { sock.end(); resolve(true); });
    sock.once("error", () => { sock.destroy(); resolve(false); });
  });
}

export async function waitForSshd(port: number, totalMs = 30_000, stepMs = 500): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < totalMs) {
    if (await probeSshd(port, stepMs)) return true;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return false;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/box/backend/ssh.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/box/backend/ssh.ts tests/box/backend/ssh.test.ts
git commit -m "feat(box/backend): add sshd readiness probe with timeout

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 3.6: Image bake

**Files:**
- Create: `src/box/backend/image.ts`
- Create: `tests/box/backend/image.test.ts`

Bake builds the base image by: (1) creating a throwaway sandbox from the manifest's `image.base`, (2) running the composed install recipe (Task 4.x), (3) snapshotting it under `baseSnapshotName`, (4) removing the throwaway sandbox.

- [ ] **Step 1: Write failing test**

`tests/box/backend/image.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const shell = vi.fn(async () => ({ success: true, code: 0, stdout: () => "", stderr: () => "" }));
const create = vi.fn(async () => ({
  shell,
  stop: vi.fn(),
  remove: vi.fn(),
}));
const builder = {
  image: vi.fn(() => builder),
  memory: vi.fn(() => builder),
  cpus: vi.fn(() => builder),
  volume: vi.fn(() => builder),
  create,
};

vi.mock("microsandbox", () => ({
  Sandbox: { builder: vi.fn(() => builder), remove: vi.fn(), get: vi.fn() },
  Volume: { builder: vi.fn(() => ({ create: vi.fn() })) },
  VolumeAlreadyExistsError: class extends Error {},
  SandboxNotFoundError: class extends Error {},
}));

const runMsbMock = vi.fn();
vi.mock("../../../src/box/backend/msb.js", () => ({ runMsb: runMsbMock }));

import { bake } from "../../../src/box/backend/image.js";
import type { ResolvedBox } from "../../../src/box/types.js";

const r: ResolvedBox = {
  version: 1,
  image: { base: "docker.io/library/debian:12-slim", toolchains: [{ node: "22" }], agents: ["claude"], packages: ["tmux"] },
  box: {
    name: "komora-box",
    resources: {},
    personalLayer: { volume: { name: "pl", mount: "/x" } },
    volumes: [], mounts: [], ports: [],
    network: { policy: "nonlocal" },
    ssh: null,
    identity: { forwardSshAgent: false },
    features: { docker: false, clipboard: false },
  },
  secrets: { workload: [], identity: [] },
  baseSnapshotName: "komora-base",
};

beforeEach(() => { vi.clearAllMocks(); });

describe("bake", () => {
  it("builds throwaway sandbox from manifest base image", async () => {
    await bake(r);
    expect(builder.image).toHaveBeenCalledWith("docker.io/library/debian:12-slim");
  });

  it("runs install recipe via shell()", async () => {
    await bake(r);
    expect(shell).toHaveBeenCalled();
  });

  it("snapshots under baseSnapshotName via msb snapshot create", async () => {
    await bake(r);
    expect(runMsbMock).toHaveBeenCalledWith(
      expect.arrayContaining(["snapshot", "create", "komora-base"]),
      expect.anything(),
    );
  });

  it("removes throwaway sandbox after snapshot", async () => {
    await bake(r);
    expect((await import("microsandbox")).Sandbox.remove).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/box/backend/image.test.ts`
Expected: FAIL

- [ ] **Step 3: Create `src/box/backend/image.ts`**

```typescript
import { Sandbox } from "microsandbox";
import { runMsb } from "./msb.js";
import { composeRecipe } from "../../baker/recipe.js";
import type { ResolvedBox } from "../types.js";
import { log } from "../../util/log.js";

const THROWAWAY = "komora-bake";

export async function bake(r: ResolvedBox): Promise<void> {
  log.info(`baking base image from ${r.image.base}`);

  let builder: any = Sandbox.builder(THROWAWAY).image(r.image.base);
  if (r.box.resources.memoryMib) builder = builder.memory(r.box.resources.memoryMib);
  if (r.box.resources.cpus) builder = builder.cpus(r.box.resources.cpus);

  const sandbox: any = await builder.create();
  try {
    const recipe = composeRecipe(r);
    const res = await sandbox.shell(recipe);
    if (!res.success) {
      const err = res.stderr?.() ?? "";
      throw new Error(`bake recipe failed (exit ${res.code}): ${err}`);
    }
    await sandbox.stop();
    await runMsb(["snapshot", "create", r.baseSnapshotName, "--from", THROWAWAY]);
  } finally {
    await Sandbox.remove(THROWAWAY);
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/box/backend/image.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/box/backend/image.ts tests/box/backend/image.test.ts
git commit -m "feat(box/backend): bake base image and snapshot it

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 3.7: Rebuild

**Files:**
- Create: `src/box/backend/rebuild.ts`
- Create: `tests/box/backend/rebuild.test.ts`

Rebuild = ensure base snapshot exists → tear down existing VM if present → create new VM from snapshot with all volumes/mounts/secrets reattached → readiness probe → success.

- [ ] **Step 1: Write failing test**

`tests/box/backend/rebuild.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const destroyMock = vi.fn();
const buildMock = vi.fn();
const statusMock = vi.fn();
const collectMock = vi.fn(async () => ({}));
const missingMock = vi.fn(async () => []);
const sshProbeMock = vi.fn(async () => true);

vi.mock("../../../src/box/backend/lifecycle.js", () => ({ destroy: destroyMock }));
vi.mock("../../../src/box/backend/sdk.js", () => ({ buildSandbox: buildMock }));
vi.mock("../../../src/box/backend/status.js", () => ({ boxStatus: statusMock }));
vi.mock("../../../src/box/backend/ssh.js", () => ({ waitForSshd: sshProbeMock }));
vi.mock("../../../src/secrets/inject.js", () => ({
  collectWorkloadValues: collectMock,
  missingWorkload: missingMock,
  buildSecretEnvArgs: () => [],
}));

import { rebuild } from "../../../src/box/backend/rebuild.js";
import type { ResolvedBox } from "../../../src/box/types.js";

const r: ResolvedBox = {
  version: 1,
  image: { base: "snap:komora-base", toolchains: [], agents: [], packages: [] },
  box: {
    name: "komora-box",
    resources: {},
    personalLayer: { volume: { name: "pl", mount: "/x" } },
    volumes: [], mounts: [],
    ports: [{ host: 2222, guest: 22 }],
    network: { policy: "nonlocal" },
    ssh: { enabled: true, user: "komora", authorizedKeysFromHost: "/k" },
    identity: { forwardSshAgent: false },
    features: { docker: false, clipboard: false },
  },
  secrets: { workload: [], identity: [] },
  baseSnapshotName: "komora-base",
};

beforeEach(() => { vi.clearAllMocks(); });

describe("rebuild", () => {
  it("destroys existing VM before recreating", async () => {
    statusMock.mockResolvedValue("running");
    await rebuild(r);
    expect(destroyMock).toHaveBeenCalledWith("komora-box");
    expect(buildMock).toHaveBeenCalled();
  });

  it("skips destroy when VM missing", async () => {
    statusMock.mockResolvedValue("missing");
    await rebuild(r);
    expect(destroyMock).not.toHaveBeenCalled();
  });

  it("waits for sshd when ssh.enabled", async () => {
    statusMock.mockResolvedValue("missing");
    await rebuild(r);
    expect(sshProbeMock).toHaveBeenCalledWith(2222, expect.any(Number));
  });

  it("skips sshd wait when ssh disabled", async () => {
    statusMock.mockResolvedValue("missing");
    await rebuild({ ...r, box: { ...r.box, ssh: null } });
    expect(sshProbeMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/box/backend/rebuild.test.ts`
Expected: FAIL

- [ ] **Step 3: Create `src/box/backend/rebuild.ts`**

```typescript
import { destroy } from "./lifecycle.js";
import { buildSandbox } from "./sdk.js";
import { boxStatus } from "./status.js";
import { waitForSshd } from "./ssh.js";
import { collectWorkloadValues, missingWorkload, buildSecretEnvArgs } from "../../secrets/inject.js";
import type { ResolvedBox } from "../types.js";
import { log } from "../../util/log.js";

export async function rebuild(r: ResolvedBox): Promise<void> {
  const status = await boxStatus(r.box.name);
  if (status !== "missing") {
    log.info(`removing existing ${r.box.name} (state=${status})`);
    await destroy(r.box.name);
  }

  const missing = await missingWorkload(r.secrets.workload);
  if (missing.length > 0) {
    log.warn(`missing workload secrets in keychain (will be skipped): ${missing.join(", ")}`);
  }

  const values = await collectWorkloadValues(r.secrets.workload);
  const secretArgs = buildSecretEnvArgs(values);

  log.info(`creating ${r.box.name} from ${r.image.base}`);
  await buildSandbox(r, { secretArgs });

  if (r.box.ssh?.enabled) {
    const port = r.box.ports.find((p) => p.guest === 22)?.host;
    if (port) {
      log.info(`waiting for sshd on host port ${port}`);
      const ok = await waitForSshd(port, 30_000);
      if (!ok) log.warn(`sshd not ready after 30s — try 'komora attach' as fallback`);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/box/backend/rebuild.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/box/backend/rebuild.ts tests/box/backend/rebuild.test.ts
git commit -m "feat(box/backend): orchestrate VM rebuild from manifest

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 4 — Baker (base image recipe)

### Task 4.1: Toolchain install fragments

**Files:**
- Create: `src/baker/install/node.sh`, `python.sh`, `go.sh`, `rust.sh`, `bun.sh`, `dotnet.sh`
- Create: `src/baker/toolchains.ts`
- Create: `tests/baker/toolchains.test.ts`

- [ ] **Step 1: Write failing test**

`tests/baker/toolchains.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { toolchainScript } from "../../src/baker/toolchains.js";

describe("toolchainScript", () => {
  it("emits a script that installs node at a specific version", () => {
    const s = toolchainScript({ node: "22" });
    expect(s).toMatch(/node/);
    expect(s).toMatch(/22/);
  });

  it("emits a script that installs python at a specific version", () => {
    expect(toolchainScript({ python: "3.12" })).toMatch(/python/i);
  });

  it("throws on unknown toolchain", () => {
    expect(() => toolchainScript({ kotlin: "1.0" })).toThrow(/unknown toolchain: kotlin/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/baker/toolchains.test.ts`
Expected: FAIL

- [ ] **Step 3: Create install scripts**

`src/baker/install/node.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
VERSION="${1:?node version required}"
curl -fsSL https://deb.nodesource.com/setup_${VERSION%%.*}.x | bash -
apt-get install -y nodejs
```

`src/baker/install/python.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
VERSION="${1:?python version required}"
apt-get install -y python${VERSION} python3-pip python3-venv
```

`src/baker/install/go.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
VERSION="${1:?go version required}"
curl -fsSL "https://go.dev/dl/go${VERSION}.linux-amd64.tar.gz" -o /tmp/go.tgz
tar -C /usr/local -xzf /tmp/go.tgz && rm /tmp/go.tgz
ln -sf /usr/local/go/bin/go /usr/local/bin/go
```

`src/baker/install/rust.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
VERSION="${1:?rust version required}"
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain "$VERSION"
```

`src/baker/install/bun.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
curl -fsSL https://bun.sh/install | bash
```

`src/baker/install/dotnet.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
VERSION="${1:?dotnet version required}"
apt-get install -y "dotnet-sdk-${VERSION}"
```

- [ ] **Step 4: Create `src/baker/toolchains.ts`**

```typescript
import type { Toolchain } from "../box/types.js";

const SUPPORTED = new Set(["node", "python", "go", "rust", "bun", "dotnet"]);

export function toolchainScript(t: Toolchain): string {
  const [name, version] = Object.entries(t)[0];
  if (!SUPPORTED.has(name)) {
    throw new Error(`unknown toolchain: ${name}`);
  }
  return `bash /opt/komora/install/${name}.sh "${version}"`;
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test -- tests/baker/toolchains.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/baker/install/*.sh src/baker/toolchains.ts tests/baker/toolchains.test.ts
git commit -m "feat(baker): add toolchain install scripts + selector

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 4.2: Agent install fragments

**Files:**
- Create: `src/baker/install/agent-claude.sh`, `agent-opencode.sh`, `agent-gemini.sh`, `agent-copilot.sh`, `agent-codex.sh`
- Create: `src/baker/agents.ts`
- Create: `tests/baker/agents.test.ts`

- [ ] **Step 1: Write failing test**

`tests/baker/agents.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { agentScript } from "../../src/baker/agents.js";

describe("agentScript", () => {
  it("returns install command for a known agent", () => {
    expect(agentScript("claude")).toMatch(/agent-claude.sh/);
    expect(agentScript("opencode")).toMatch(/agent-opencode.sh/);
  });

  it("throws on unknown agent", () => {
    expect(() => agentScript("ghost")).toThrow(/unknown agent: ghost/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/baker/agents.test.ts`
Expected: FAIL

- [ ] **Step 3: Create install scripts**

For each agent, create `src/baker/install/agent-<name>.sh`. Each script installs the agent's CLI globally. Example:

`src/baker/install/agent-claude.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
npm install -g @anthropic-ai/claude-code
```

`src/baker/install/agent-opencode.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
npm install -g opencode-ai
```

`src/baker/install/agent-gemini.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
npm install -g @google/gemini-cli
```

`src/baker/install/agent-copilot.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
# GitHub Copilot CLI
gh extension install github/gh-copilot || true
```

`src/baker/install/agent-codex.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
npm install -g @openai/codex
```

- [ ] **Step 4: Create `src/baker/agents.ts`**

```typescript
const KNOWN = new Set(["claude", "opencode", "gemini", "copilot", "codex"]);

export function agentScript(name: string): string {
  if (!KNOWN.has(name)) throw new Error(`unknown agent: ${name}`);
  return `bash /opt/komora/install/agent-${name}.sh`;
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test -- tests/baker/agents.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/baker/install/agent-*.sh src/baker/agents.ts tests/baker/agents.test.ts
git commit -m "feat(baker): add agent install scripts + selector

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 4.3: Compose the full bake recipe

**Files:**
- Create: `src/baker/recipe.ts`
- Create: `src/baker/install/sshd.sh`
- Create: `src/baker/install/mise.sh`
- Create: `tests/baker/recipe.test.ts`

The recipe assembles: apt-get update → packages → mise + direnv → sshd setup → toolchains → agents → cleanup. Install scripts are mounted at `/opt/komora/install/`.

- [ ] **Step 1: Write failing test**

`tests/baker/recipe.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { composeRecipe } from "../../src/baker/recipe.js";
import type { ResolvedBox } from "../../src/box/types.js";

const r = (overrides: Partial<ResolvedBox["image"]> = {}): ResolvedBox =>
  ({
    image: { base: "debian:12-slim", toolchains: [], agents: [], packages: [], ...overrides },
    box: {
      name: "komora-box", resources: {},
      personalLayer: { volume: { name: "p", mount: "/x" } },
      volumes: [], mounts: [], ports: [],
      network: { policy: "nonlocal" },
      ssh: { enabled: true, user: "komora", authorizedKeysFromHost: "/k" },
      identity: { forwardSshAgent: false },
      features: { docker: false, clipboard: false },
    },
    secrets: { workload: [], identity: [] },
    baseSnapshotName: "komora-base",
    version: 1,
  } as ResolvedBox);

describe("composeRecipe", () => {
  it("starts with apt-get update", () => {
    expect(composeRecipe(r())).toMatch(/^set -euo pipefail[\s\S]*apt-get update/);
  });

  it("installs declared packages", () => {
    expect(composeRecipe(r({ packages: ["tmux", "zsh"] }))).toMatch(/apt-get install -y .*tmux.*zsh/);
  });

  it("invokes each toolchain script", () => {
    const s = composeRecipe(r({ toolchains: [{ node: "22" }, { python: "3.12" }] }));
    expect(s).toMatch(/install\/node.sh.*22/);
    expect(s).toMatch(/install\/python.sh.*3.12/);
  });

  it("invokes each agent script", () => {
    const s = composeRecipe(r({ agents: ["claude", "opencode"] }));
    expect(s).toMatch(/install\/agent-claude.sh/);
    expect(s).toMatch(/install\/agent-opencode.sh/);
  });

  it("installs sshd when ssh.enabled", () => {
    expect(composeRecipe(r())).toMatch(/install\/sshd.sh/);
  });

  it("always installs mise + direnv", () => {
    expect(composeRecipe(r())).toMatch(/install\/mise.sh/);
  });

  it("ends with apt-get clean", () => {
    expect(composeRecipe(r())).toMatch(/apt-get clean[\s\S]*$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/baker/recipe.test.ts`
Expected: FAIL

- [ ] **Step 3: Create `src/baker/install/sshd.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
USER_NAME="${1:?user required}"
PUBKEY_PATH="${2:?pubkey path required}"
apt-get install -y openssh-server
useradd -m -s /bin/bash "$USER_NAME" || true
mkdir -p "/home/$USER_NAME/.ssh"
chmod 700 "/home/$USER_NAME/.ssh"
cat "$PUBKEY_PATH" >> "/home/$USER_NAME/.ssh/authorized_keys"
chmod 600 "/home/$USER_NAME/.ssh/authorized_keys"
chown -R "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.ssh"
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
mkdir -p /run/sshd
```

- [ ] **Step 4: Create `src/baker/install/mise.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
curl -fsSL https://mise.run | sh
apt-get install -y direnv
```

- [ ] **Step 5: Create `src/baker/recipe.ts`**

```typescript
import type { ResolvedBox } from "../box/types.js";
import { toolchainScript } from "./toolchains.js";
import { agentScript } from "./agents.js";

export function composeRecipe(r: ResolvedBox): string {
  const lines: string[] = ["set -euo pipefail", "apt-get update"];

  const corePkgs = ["ca-certificates", "curl", "gnupg", "git", "build-essential"];
  lines.push(`apt-get install -y ${corePkgs.join(" ")}`);

  if (r.image.packages.length > 0) {
    lines.push(`apt-get install -y ${r.image.packages.join(" ")}`);
  }

  lines.push("bash /opt/komora/install/mise.sh");

  if (r.box.ssh?.enabled) {
    const u = r.box.ssh.user;
    const k = "/opt/komora/authorized_keys";
    lines.push(`bash /opt/komora/install/sshd.sh "${u}" "${k}"`);
  }

  for (const t of r.image.toolchains) {
    lines.push(toolchainScript(t));
  }

  for (const a of r.image.agents) {
    lines.push(agentScript(a));
  }

  lines.push("apt-get clean", "rm -rf /var/lib/apt/lists/*");
  return lines.join("\n");
}
```

- [ ] **Step 6: Run tests to verify pass**

Run: `npm test -- tests/baker/recipe.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/baker/install/sshd.sh src/baker/install/mise.sh src/baker/recipe.ts tests/baker/recipe.test.ts
git commit -m "feat(baker): compose full bake recipe with packages, sshd, toolchains, agents

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 4.4: Mount install scripts into the bake sandbox

**Files:**
- Modify: `src/box/backend/image.ts`
- Modify: `package.json` (already correct from Task 0.1; verify `files:` includes `src/baker/install/*.sh`)
- Modify: `tests/box/backend/image.test.ts`

The recipe references `/opt/komora/install/*.sh` inside the VM. Wire them in via `builder.script()` (microsandbox 0.4.6 mounts these at `/.msb/scripts/`) — or by copying with `builder.volume(... bind(localScriptsDir))`. We use `volume(...).bind()` to mount the on-disk script directory.

Also mount `authorizedKeysFromHost` at `/opt/komora/authorized_keys` when ssh is enabled.

- [ ] **Step 1: Update the test**

Add to `tests/box/backend/image.test.ts` (inside the existing describe block):
```typescript
  it("mounts the install scripts directory at /opt/komora/install", async () => {
    await bake(r);
    const calls = (builder.volume.mock.calls as any[]).map((c) => c[0]);
    expect(calls).toContain("/opt/komora/install");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/box/backend/image.test.ts`
Expected: FAIL (new assertion)

- [ ] **Step 3: Update `src/box/backend/image.ts`**

Replace its body with:
```typescript
import { Sandbox } from "microsandbox";
import path from "node:path";
import url from "node:url";
import { runMsb } from "./msb.js";
import { composeRecipe } from "../../baker/recipe.js";
import type { ResolvedBox } from "../types.js";
import { log } from "../../util/log.js";

const THROWAWAY = "komora-bake";

function installScriptsDir(): string {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "baker", "install");
}

export async function bake(r: ResolvedBox): Promise<void> {
  log.info(`baking base image from ${r.image.base}`);

  let builder: any = Sandbox.builder(THROWAWAY).image(r.image.base);
  if (r.box.resources.memoryMib) builder = builder.memory(r.box.resources.memoryMib);
  if (r.box.resources.cpus) builder = builder.cpus(r.box.resources.cpus);

  builder = builder.volume("/opt/komora/install", (b: any) => b.bind(installScriptsDir()));

  if (r.box.ssh?.enabled) {
    builder = builder.volume("/opt/komora/authorized_keys", (b: any) => b.bind(r.box.ssh!.authorizedKeysFromHost));
  }

  const sandbox: any = await builder.create();
  try {
    const recipe = composeRecipe(r);
    const res = await sandbox.shell(recipe);
    if (!res.success) {
      const err = res.stderr?.() ?? "";
      throw new Error(`bake recipe failed (exit ${res.code}): ${err}`);
    }
    await sandbox.stop();
    await runMsb(["snapshot", "create", r.baseSnapshotName, "--from", THROWAWAY]);
  } finally {
    await Sandbox.remove(THROWAWAY);
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/box/backend/image.test.ts tests/baker/`
Expected: PASS

- [ ] **Step 5: Update `package.json` files: section**

```json
"files": ["dist/", "src/baker/install/", "schema/"]
```

- [ ] **Step 6: Commit**

```bash
git add src/box/backend/image.ts tests/box/backend/image.test.ts package.json
git commit -m "feat(baker): mount install scripts into bake VM at /opt/komora/install

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 5 — Commands

Each command follows the same shape: load manifest, call backend, log result. Tests mock the backend functions (already covered by their own tests in Phase 3).

### Task 5.1: `komora bake`

**Files:**
- Create: `src/commands/bake.ts`
- Create: `tests/commands/bake.test.ts`

- [ ] **Step 1: Write failing test**

`tests/commands/bake.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const bakeMock = vi.fn();
const loadBoxMock = vi.fn();

vi.mock("../../src/box/backend/image.js", () => ({ bake: bakeMock }));
vi.mock("../../src/box/index.js", () => ({ loadBox: loadBoxMock }));

import { bakeCmd } from "../../src/commands/bake.js";

beforeEach(() => { vi.clearAllMocks(); });

describe("bake command", () => {
  it("loads the manifest and invokes bake()", async () => {
    loadBoxMock.mockResolvedValue({ baseSnapshotName: "komora-base" });
    await bakeCmd({});
    expect(loadBoxMock).toHaveBeenCalled();
    expect(bakeMock).toHaveBeenCalled();
  });

  it("passes through explicit manifest path", async () => {
    loadBoxMock.mockResolvedValue({});
    await bakeCmd({ manifest: "/custom/box.yaml" });
    expect(loadBoxMock).toHaveBeenCalledWith("/custom/box.yaml");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/commands/bake.test.ts`
Expected: FAIL

- [ ] **Step 3: Create `src/commands/bake.ts`**

```typescript
import { loadBox } from "../box/index.js";
import { bake } from "../box/backend/image.js";

export interface BakeOpts {
  manifest?: string;
}

export async function bakeCmd(opts: BakeOpts): Promise<void> {
  const box = await loadBox(opts.manifest);
  await bake(box);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/commands/bake.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/bake.ts tests/commands/bake.test.ts
git commit -m "feat(cmd): add bake command

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 5.2: `komora rebuild`

**Files:**
- Create: `src/commands/rebuild.ts`
- Create: `tests/commands/rebuild.test.ts`

- [ ] **Step 1: Write failing test**

`tests/commands/rebuild.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const rebuildMock = vi.fn();
const loadBoxMock = vi.fn();

vi.mock("../../src/box/backend/rebuild.js", () => ({ rebuild: rebuildMock }));
vi.mock("../../src/box/index.js", () => ({ loadBox: loadBoxMock }));

import { rebuildCmd } from "../../src/commands/rebuild.js";

beforeEach(() => { vi.clearAllMocks(); });

describe("rebuild command", () => {
  it("loads manifest and invokes rebuild()", async () => {
    loadBoxMock.mockResolvedValue({});
    await rebuildCmd({});
    expect(rebuildMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/commands/rebuild.test.ts`
Expected: FAIL

- [ ] **Step 3: Create `src/commands/rebuild.ts`**

```typescript
import { loadBox } from "../box/index.js";
import { rebuild } from "../box/backend/rebuild.js";

export interface RebuildOpts {
  manifest?: string;
}

export async function rebuildCmd(opts: RebuildOpts): Promise<void> {
  const box = await loadBox(opts.manifest);
  await rebuild(box);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/commands/rebuild.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/rebuild.ts tests/commands/rebuild.test.ts
git commit -m "feat(cmd): add rebuild command

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 5.3: lifecycle commands (`up`, `down`, `pause`, `resume`, `destroy`)

**Files:**
- Create: `src/commands/up.ts`, `down.ts`, `pause.ts`, `destroy.ts`
- Create: `tests/commands/up.test.ts`, `down.test.ts`, `pause.test.ts`, `destroy.test.ts`

Each command is ~4 lines: load manifest → call backend → log. Pattern repeated for each.

- [ ] **Step 1: Write `tests/commands/up.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const upMock = vi.fn();
const loadBoxMock = vi.fn(async () => ({ box: { name: "komora-box" } }));

vi.mock("../../src/box/backend/lifecycle.js", () => ({ up: upMock, down: vi.fn(), pause: vi.fn(), resume: vi.fn(), destroy: vi.fn() }));
vi.mock("../../src/box/index.js", () => ({ loadBox: loadBoxMock }));

import { upCmd } from "../../src/commands/up.js";

beforeEach(() => { vi.clearAllMocks(); });

describe("up command", () => {
  it("starts the box by manifest name", async () => {
    await upCmd({});
    expect(upMock).toHaveBeenCalledWith("komora-box");
  });
});
```

- [ ] **Step 2: Repeat the same shape for `down`, `pause`, `destroy`**

`tests/commands/down.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
const downMock = vi.fn();
const loadBoxMock = vi.fn(async () => ({ box: { name: "komora-box" } }));
vi.mock("../../src/box/backend/lifecycle.js", () => ({ up: vi.fn(), down: downMock, pause: vi.fn(), resume: vi.fn(), destroy: vi.fn() }));
vi.mock("../../src/box/index.js", () => ({ loadBox: loadBoxMock }));
import { downCmd } from "../../src/commands/down.js";
beforeEach(() => vi.clearAllMocks());
describe("down command", () => {
  it("stops the box", async () => { await downCmd({}); expect(downMock).toHaveBeenCalledWith("komora-box"); });
});
```

`tests/commands/pause.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
const pauseMock = vi.fn();
const resumeMock = vi.fn();
const loadBoxMock = vi.fn(async () => ({ box: { name: "komora-box" } }));
vi.mock("../../src/box/backend/lifecycle.js", () => ({ up: vi.fn(), down: vi.fn(), pause: pauseMock, resume: resumeMock, destroy: vi.fn() }));
vi.mock("../../src/box/index.js", () => ({ loadBox: loadBoxMock }));
import { pauseCmd, resumeCmd } from "../../src/commands/pause.js";
beforeEach(() => vi.clearAllMocks());
describe("pause/resume", () => {
  it("pauseCmd calls pause()", async () => { await pauseCmd({}); expect(pauseMock).toHaveBeenCalledWith("komora-box"); });
  it("resumeCmd calls resume()", async () => { await resumeCmd({}); expect(resumeMock).toHaveBeenCalledWith("komora-box"); });
});
```

`tests/commands/destroy.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
const destroyMock = vi.fn();
const loadBoxMock = vi.fn(async () => ({ box: { name: "komora-box" } }));
vi.mock("../../src/box/backend/lifecycle.js", () => ({ up: vi.fn(), down: vi.fn(), pause: vi.fn(), resume: vi.fn(), destroy: destroyMock }));
vi.mock("../../src/box/index.js", () => ({ loadBox: loadBoxMock }));
import { destroyCmd } from "../../src/commands/destroy.js";
beforeEach(() => vi.clearAllMocks());
describe("destroy", () => {
  it("removes the box", async () => { await destroyCmd({}); expect(destroyMock).toHaveBeenCalledWith("komora-box"); });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/commands/up.test.ts tests/commands/down.test.ts tests/commands/pause.test.ts tests/commands/destroy.test.ts`
Expected: FAIL

- [ ] **Step 4: Create commands**

`src/commands/up.ts`:
```typescript
import { loadBox } from "../box/index.js";
import { up } from "../box/backend/lifecycle.js";
export interface UpOpts { manifest?: string; }
export async function upCmd(opts: UpOpts): Promise<void> {
  const b = await loadBox(opts.manifest);
  await up(b.box.name);
}
```

`src/commands/down.ts`:
```typescript
import { loadBox } from "../box/index.js";
import { down } from "../box/backend/lifecycle.js";
export interface DownOpts { manifest?: string; }
export async function downCmd(opts: DownOpts): Promise<void> {
  const b = await loadBox(opts.manifest);
  await down(b.box.name);
}
```

`src/commands/pause.ts`:
```typescript
import { loadBox } from "../box/index.js";
import { pause, resume } from "../box/backend/lifecycle.js";
export interface PauseOpts { manifest?: string; }
export async function pauseCmd(opts: PauseOpts): Promise<void> {
  const b = await loadBox(opts.manifest);
  await pause(b.box.name);
}
export async function resumeCmd(opts: PauseOpts): Promise<void> {
  const b = await loadBox(opts.manifest);
  await resume(b.box.name);
}
```

`src/commands/destroy.ts`:
```typescript
import { loadBox } from "../box/index.js";
import { destroy } from "../box/backend/lifecycle.js";
export interface DestroyOpts { manifest?: string; volumes?: boolean; }
export async function destroyCmd(opts: DestroyOpts): Promise<void> {
  const b = await loadBox(opts.manifest);
  await destroy(b.box.name);
  // `--volumes` flag handled in CLI wiring; the backend will gain volume removal in a followup
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test -- tests/commands/up.test.ts tests/commands/down.test.ts tests/commands/pause.test.ts tests/commands/destroy.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/commands/up.ts src/commands/down.ts src/commands/pause.ts src/commands/destroy.ts tests/commands/up.test.ts tests/commands/down.test.ts tests/commands/pause.test.ts tests/commands/destroy.test.ts
git commit -m "feat(cmd): add up/down/pause/resume/destroy commands

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 5.4: `komora ssh` and `komora attach`

**Files:**
- Create: `src/commands/ssh.ts`, `src/commands/attach.ts`
- Create: `tests/commands/ssh.test.ts`, `tests/commands/attach.test.ts`

`ssh` shells out to `ssh -p <port> -i ... <user>@127.0.0.1`. `attach` invokes `msb exec -t <name> bash`.

- [ ] **Step 1: Write failing tests**

`tests/commands/ssh.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({ spawn: spawnMock }));
const loadBoxMock = vi.fn(async () => ({
  box: { name: "komora-box", ssh: { enabled: true, user: "komora", authorizedKeysFromHost: "/k" }, ports: [{ host: 2222, guest: 22 }] },
}));
vi.mock("../../src/box/index.js", () => ({ loadBox: loadBoxMock }));

import { sshCmd } from "../../src/commands/ssh.js";

beforeEach(() => { vi.clearAllMocks(); spawnMock.mockReturnValue({ on: (e: string, cb: any) => { if (e === "exit") setTimeout(() => cb(0), 0); } }); });

describe("ssh command", () => {
  it("invokes ssh on the forwarded port", async () => {
    await sshCmd({});
    expect(spawnMock).toHaveBeenCalledWith("ssh", expect.arrayContaining(["-p", "2222", "komora@127.0.0.1"]), expect.objectContaining({ stdio: "inherit" }));
  });

  it("errors when ssh section is missing", async () => {
    loadBoxMock.mockResolvedValueOnce({ box: { name: "x", ssh: null, ports: [] } });
    await expect(sshCmd({})).rejects.toThrow(/ssh.*disabled|no ssh/i);
  });
});
```

`tests/commands/attach.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const runMsbMock = vi.fn();
vi.mock("../../src/box/backend/msb.js", () => ({ runMsb: runMsbMock }));
const loadBoxMock = vi.fn(async () => ({ box: { name: "komora-box" } }));
vi.mock("../../src/box/index.js", () => ({ loadBox: loadBoxMock }));

import { attachCmd } from "../../src/commands/attach.js";

beforeEach(() => vi.clearAllMocks());

describe("attach command", () => {
  it("invokes msb exec -t with bash", async () => {
    await attachCmd({});
    expect(runMsbMock).toHaveBeenCalledWith(expect.arrayContaining(["exec", "-t", "komora-box", "bash"]), expect.anything());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/commands/ssh.test.ts tests/commands/attach.test.ts`
Expected: FAIL

- [ ] **Step 3: Create `src/commands/ssh.ts`**

```typescript
import { spawn } from "node:child_process";
import { loadBox } from "../box/index.js";

export interface SshOpts { manifest?: string; }

export async function sshCmd(opts: SshOpts): Promise<void> {
  const b = await loadBox(opts.manifest);
  if (!b.box.ssh?.enabled) throw new Error("ssh is disabled in box.yaml");
  const port = b.box.ports.find((p) => p.guest === 22)?.host;
  if (!port) throw new Error("no host port forwarded for guest 22");
  const user = b.box.ssh.user;

  await new Promise<void>((resolve, reject) => {
    const child = spawn("ssh", ["-p", String(port), `${user}@127.0.0.1`], { stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ssh exited ${code}`))));
    child.on("error", reject);
  });
}
```

- [ ] **Step 4: Create `src/commands/attach.ts`**

```typescript
import { loadBox } from "../box/index.js";
import { runMsb } from "../box/backend/msb.js";

export interface AttachOpts { manifest?: string; }

export async function attachCmd(opts: AttachOpts): Promise<void> {
  const b = await loadBox(opts.manifest);
  await runMsb(["exec", "-t", b.box.name, "bash"], { stdio: "inherit" });
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test -- tests/commands/ssh.test.ts tests/commands/attach.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/commands/ssh.ts src/commands/attach.ts tests/commands/ssh.test.ts tests/commands/attach.test.ts
git commit -m "feat(cmd): add ssh and attach commands

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 5.5: `komora status`

**Files:**
- Create: `src/commands/status.ts`
- Create: `tests/commands/status.test.ts`

Reports: state (running/stopped/missing/paused), sshd readiness if ssh enabled, attached volume names.

- [ ] **Step 1: Write failing test**

`tests/commands/status.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const statusMock = vi.fn();
const probeMock = vi.fn();
const loadBoxMock = vi.fn();

vi.mock("../../src/box/backend/status.js", () => ({ boxStatus: statusMock }));
vi.mock("../../src/box/backend/ssh.js", () => ({ probeSshd: probeMock }));
vi.mock("../../src/box/index.js", () => ({ loadBox: loadBoxMock }));

import { statusCmd } from "../../src/commands/status.js";

beforeEach(() => vi.clearAllMocks());

describe("status command", () => {
  it("prints VM state and sshd readiness", async () => {
    loadBoxMock.mockResolvedValue({
      box: { name: "komora-box", ssh: { enabled: true }, ports: [{ host: 2222, guest: 22 }] },
    });
    statusMock.mockResolvedValue("running");
    probeMock.mockResolvedValue(true);
    const lines: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    (process.stdout as any).write = (s: string) => { lines.push(s); return true; };
    try { await statusCmd({}); } finally { (process.stdout as any).write = orig; }
    const out = lines.join("");
    expect(out).toMatch(/komora-box.*running/);
    expect(out).toMatch(/sshd.*ready/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/commands/status.test.ts`
Expected: FAIL

- [ ] **Step 3: Create `src/commands/status.ts`**

```typescript
import { loadBox } from "../box/index.js";
import { boxStatus } from "../box/backend/status.js";
import { probeSshd } from "../box/backend/ssh.js";

export interface StatusOpts { manifest?: string; }

export async function statusCmd(opts: StatusOpts): Promise<void> {
  const b = await loadBox(opts.manifest);
  const state = await boxStatus(b.box.name);
  process.stdout.write(`${b.box.name}: ${state}\n`);

  if (b.box.ssh?.enabled) {
    const port = b.box.ports.find((p) => p.guest === 22)?.host;
    if (port) {
      const ok = await probeSshd(port, 1500);
      process.stdout.write(`  sshd (port ${port}): ${ok ? "ready" : "not ready"}\n`);
    }
  }

  if (b.box.volumes.length > 0) {
    process.stdout.write(`  volumes: ${b.box.volumes.map((v) => v.name).join(", ")}\n`);
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/commands/status.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/status.ts tests/commands/status.test.ts
git commit -m "feat(cmd): add status command

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 5.6: `komora logs`

**Files:**
- Create: `src/commands/logs.ts`
- Create: `tests/commands/logs.test.ts`

Passthrough to `msb logs <name>`.

- [ ] **Step 1: Write failing test**

`tests/commands/logs.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
const runMsbMock = vi.fn();
vi.mock("../../src/box/backend/msb.js", () => ({ runMsb: runMsbMock }));
const loadBoxMock = vi.fn(async () => ({ box: { name: "komora-box" } }));
vi.mock("../../src/box/index.js", () => ({ loadBox: loadBoxMock }));
import { logsCmd } from "../../src/commands/logs.js";
beforeEach(() => vi.clearAllMocks());
describe("logs command", () => {
  it("invokes msb logs with the box name", async () => {
    await logsCmd({});
    expect(runMsbMock).toHaveBeenCalledWith(expect.arrayContaining(["logs", "komora-box"]), expect.anything());
  });
  it("appends --follow when -f is passed", async () => {
    await logsCmd({ follow: true });
    expect(runMsbMock).toHaveBeenCalledWith(expect.arrayContaining(["logs", "komora-box", "--follow"]), expect.anything());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/commands/logs.test.ts`
Expected: FAIL

- [ ] **Step 3: Create `src/commands/logs.ts`**

```typescript
import { loadBox } from "../box/index.js";
import { runMsb } from "../box/backend/msb.js";

export interface LogsOpts { manifest?: string; follow?: boolean; }

export async function logsCmd(opts: LogsOpts): Promise<void> {
  const b = await loadBox(opts.manifest);
  const args = ["logs", b.box.name];
  if (opts.follow) args.push("--follow");
  await runMsb(args, { stdio: "inherit" });
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/commands/logs.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/logs.ts tests/commands/logs.test.ts
git commit -m "feat(cmd): add logs command as msb logs passthrough

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 5.7: `komora secret set/list/rm`

**Files:**
- Create: `src/commands/secret.ts`
- Create: `tests/commands/secret.test.ts`

- [ ] **Step 1: Write failing test**

`tests/commands/secret.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setCmd, listCmd, rmCmd } from "../../src/commands/secret.js";
import { getSecret } from "../../src/secrets/keychain.js";

beforeEach(() => {
  const tmp = mkdtempSync(path.join(tmpdir(), "komora-sec-cmd-"));
  process.env.HOME = tmp;
  process.env.XDG_CONFIG_HOME = path.join(tmp, ".config");
});

describe("secret commands", () => {
  it("setCmd writes a secret given a value", async () => {
    await setCmd("FOO", { value: "bar" });
    expect(await getSecret("FOO")).toBe("bar");
  });

  it("listCmd prints names line-by-line", async () => {
    await setCmd("A", { value: "1" });
    await setCmd("B", { value: "2" });
    const lines: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    (process.stdout as any).write = (s: string) => { lines.push(s); return true; };
    try { await listCmd(); } finally { (process.stdout as any).write = orig; }
    expect(lines.join("")).toMatch(/A\nB/);
  });

  it("rmCmd removes a secret", async () => {
    await setCmd("X", { value: "1" });
    await rmCmd("X");
    expect(await getSecret("X")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/commands/secret.test.ts`
Expected: FAIL

- [ ] **Step 3: Create `src/commands/secret.ts`**

```typescript
import { setSecret, listSecrets, removeSecret } from "../secrets/keychain.js";

export interface SetOpts { value?: string; fromStdin?: boolean; }

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8").replace(/\n$/, "");
}

export async function setCmd(name: string, opts: SetOpts): Promise<void> {
  let value = opts.value;
  if (value === undefined && opts.fromStdin) value = await readStdin();
  if (value === undefined) throw new Error("secret value required (use --value or --from-stdin)");
  await setSecret(name, value);
}

export async function listCmd(): Promise<void> {
  const names = await listSecrets();
  for (const n of names.sort()) process.stdout.write(`${n}\n`);
}

export async function rmCmd(name: string): Promise<void> {
  await removeSecret(name);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/commands/secret.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/secret.ts tests/commands/secret.test.ts
git commit -m "feat(cmd): add secret set/list/rm commands

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 6 — CLI wiring

### Task 6.1: Wire commands into `src/cli.ts`

**Files:**
- Modify: `src/cli.ts`
- Create: `tests/cli.test.ts` (smoke test: imports cli.ts and verifies it constructs)

- [ ] **Step 1: Write failing test**

`tests/cli.test.ts`:
```typescript
import { describe, it, expect } from "vitest";

describe("cli", () => {
  it("loads without throwing", async () => {
    process.argv = ["node", "cli.js", "--help"];
    // Calling parseAsync causes commander to print help and exit; intercept.
    const exitCalls: number[] = [];
    const realExit = process.exit;
    (process as any).exit = (code: number) => { exitCalls.push(code); throw new Error("exit"); };
    let mod: any;
    try {
      // Re-import each time to pick up the test's argv
      mod = await import("../src/cli.js?test=" + Math.random());
    } catch (e: any) {
      if (e?.message !== "exit") throw e;
    } finally {
      (process as any).exit = realExit;
    }
    expect(exitCalls).toBeDefined();
  });
});
```

- [ ] **Step 2: Replace `src/cli.ts` contents**

```typescript
#!/usr/bin/env node
import { Command } from "commander";
import { bakeCmd } from "./commands/bake.js";
import { rebuildCmd } from "./commands/rebuild.js";
import { upCmd } from "./commands/up.js";
import { downCmd } from "./commands/down.js";
import { pauseCmd, resumeCmd } from "./commands/pause.js";
import { destroyCmd } from "./commands/destroy.js";
import { sshCmd } from "./commands/ssh.js";
import { attachCmd } from "./commands/attach.js";
import { statusCmd } from "./commands/status.js";
import { logsCmd } from "./commands/logs.js";
import { setCmd, listCmd, rmCmd } from "./commands/secret.js";

const program = new Command();
program
  .name("komora")
  .description("Personal dev VM orchestrator built on microsandbox.")
  .version("0.3.0")
  .option("-m, --manifest <path>", "Path to box.yaml (default: ~/.config/komora/box.yaml)");

const opts = () => ({ manifest: program.opts().manifest });

program.command("bake").description("Build/refresh the base image.").action(() => bakeCmd(opts()));
program.command("rebuild").description("Recreate the VM from base snapshot + manifest.").action(() => rebuildCmd(opts()));
program.command("up").description("Start the VM.").action(() => upCmd(opts()));
program.command("down").description("Stop the VM.").action(() => downCmd(opts()));
program.command("pause").description("Pause the VM.").action(() => pauseCmd(opts()));
program.command("resume").description("Resume a paused VM.").action(() => resumeCmd(opts()));
program.command("destroy").description("Remove the VM (volumes preserved).").action(() => destroyCmd(opts()));
program.command("ssh").description("Connect to the VM via sshd.").action(() => sshCmd(opts()));
program.command("attach").description("Attach via 'msb exec -t bash' (fallback when sshd is down).").action(() => attachCmd(opts()));
program.command("status").description("Show VM state, sshd readiness, attached volumes.").action(() => statusCmd(opts()));
program.command("logs").option("-f, --follow", "Stream new lines").description("Tail VM logs.").action((o) => logsCmd({ ...opts(), follow: !!o.follow }));

const sec = program.command("secret").description("Manage host-side secrets.");
sec.command("set <name>").option("--value <v>", "Inline value").option("--from-stdin", "Read value from stdin").action((n, o) => setCmd(n, o));
sec.command("list").action(() => listCmd());
sec.command("rm <name>").action((n) => rmCmd(n));

program.parseAsync(process.argv).catch((e) => {
  process.stderr.write(`komora: ${e?.message ?? e}\n`);
  process.exit(1);
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test -- tests/cli.test.ts`
Expected: PASS

- [ ] **Step 4: Smoke check the build**

Run: `npm run typecheck`
Expected: PASS

Run: `npm run build`
Expected: PASS

Run: `node dist/cli.js --help`
Expected: full subcommand listing.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts tests/cli.test.ts
git commit -m "feat(cli): wire all box commands

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 7 — Integration test, README, docs

### Task 7.1: Integration smoke test (gated)

**Files:**
- Create: `tests/integration/box.e2e.test.ts`
- Create: `tests/integration/fixtures/box.yaml`

This test only runs when `KOMORA_E2E=1` is set. It performs `bake → rebuild → status → destroy` against a real `msb` daemon. CI skips it by default.

- [ ] **Step 1: Create fixture**

`tests/integration/fixtures/box.yaml`:
```yaml
version: 1
image:
  base: docker.io/library/debian:12-slim
  packages: [tmux]
box:
  name: komora-e2e
  resources: { memoryMib: 1024, cpus: 1 }
  personalLayer:
    volume: { name: komora-e2e-pl, mount: /home/komora/.local }
  ports:
    - { host: 32222, guest: 22 }
  ssh:
    enabled: false
    user: komora
    authorizedKeysFromHost: /dev/null
  identity: { forwardSshAgent: false }
```

- [ ] **Step 2: Create the test**

`tests/integration/box.e2e.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import path from "node:path";
import { spawn } from "node:child_process";

const E2E = process.env.KOMORA_E2E === "1";

function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const c = spawn("node", ["dist/cli.js", ...args], { env: process.env });
    let out = "", err = "";
    c.stdout.on("data", (d) => (out += d));
    c.stderr.on("data", (d) => (err += d));
    c.on("exit", (code) => resolve({ code: code ?? 1, stdout: out, stderr: err }));
  });
}

describe.skipIf(!E2E)("box e2e", () => {
  const manifest = path.resolve("tests/integration/fixtures/box.yaml");
  const env = { ...process.env, KOMORA_MANIFEST: manifest };

  it("bake → rebuild → status → destroy", async () => {
    const bakeRes = await run(["bake", "-m", manifest]);
    expect(bakeRes.code).toBe(0);
    const rebuildRes = await run(["rebuild", "-m", manifest]);
    expect(rebuildRes.code).toBe(0);
    const statusRes = await run(["status", "-m", manifest]);
    expect(statusRes.stdout).toMatch(/running/);
    const destroyRes = await run(["destroy", "-m", manifest]);
    expect(destroyRes.code).toBe(0);
  }, 1_200_000);
});
```

- [ ] **Step 3: Smoke run (without E2E flag — skipped)**

Run: `npm test -- tests/integration/box.e2e.test.ts`
Expected: 1 test skipped.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/box.e2e.test.ts tests/integration/fixtures/box.yaml
git commit -m "test(integration): add gated e2e bake/rebuild/status/destroy smoke

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 7.2: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace README with new content**

`README.md`:
```markdown
# komora

A personal dev VM orchestrator built on [microsandbox](https://github.com/superradcompany/microsandbox).

`komora` builds and manages **one persistent microVM** ("the box") that you live in instead of your host. The box has your toolchains, agents (claude, opencode, gemini, copilot, codex), tmux, shell, and editor pre-installed. You ssh into it like a remote machine, but it runs locally — and you can rebuild it from scratch with one command without losing anything you care about.

## Why

- **Isolate AI coding agents.** Agents can install, modify, and run code freely inside the box without touching your host filesystem, your SSH keys, or your cloud credentials.
- **Tiered secrets.** Workload secrets (API keys) are injected via microsandbox `secretEnv` — the real value is materialized only for outbound requests to a specific declared domain. Identity secrets (your SSH key) never enter the box; instead, your `SSH_AUTH_SOCK` is forwarded.
- **Reproducible by design.** Anything not on a declared volume or bind-mount is lost on rebuild. That discipline keeps the box honest.

## Install

```bash
npm install -g komora
```

Requires Node ≥22 and a running [microsandbox](https://github.com/superradcompany/microsandbox) daemon.

## Quick start

1. Write `~/.config/komora/box.yaml` (see `docs/design/2026-05-19-personal-dev-box-design.md` for the full schema, or copy `tests/fixtures/box/full.yaml` as a starting point).
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for personal dev box model

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 7.3: Update CLAUDE.md and `docs/architecture.md`

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: Update `CLAUDE.md`**

Replace the "Project", "Architecture", "Current state" sections with:

```markdown
## Project

`komora` is a TypeScript CLI that builds and manages a single persistent personal dev microVM ("the box") via microsandbox. Replaces the prior per-workspace ephemeral sandbox model.

**Branch model:** `master` is stable. Feature work on branches. Preserve `archive/komora-research`.

## Architecture

- `src/box/` — manifest types, schema, loader, resolver
- `src/box/backend/` — msb/SDK wrappers, lifecycle, image bake, rebuild, ssh probe, status
- `src/baker/` — base image recipe + install fragments
- `src/secrets/` — file-backed keychain, tiered classification, workload injection
- `src/commands/` — bake, rebuild, up, down, pause, resume, destroy, ssh, attach, status, logs, secret
- `src/util/` — paths, log

See `docs/design/2026-05-19-personal-dev-box-design.md` for the full design.

## Current state (as of 2026-05-20)

Branch `feat/personal-dev-box`: complete rewrite around the personal-dev-box model.
- Manifest: `~/.config/komora/box.yaml` (single source of truth)
- Backend: microsandbox SDK + `msb` CLI (snapshot, exec, logs)
- Tiered secrets: workload via `secretEnv`, identity via `SSH_AUTH_SOCK` forwarding
```

- [ ] **Step 2: Replace `docs/architecture.md`**

```markdown
# Architecture

See `docs/design/2026-05-19-personal-dev-box-design.md` for the canonical design reference.

This file is retained as an index pointer; do not duplicate spec content here.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/architecture.md
git commit -m "docs: align CLAUDE.md and architecture.md with personal dev box model

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### Task 7.4: Update `package.json` description and version

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Edit**

Set:
```json
"version": "0.3.0",
"description": "Personal dev VM orchestrator built on microsandbox.",
```

Remove the `proper-lockfile` dependency (was for per-workspace sandbox locking — no longer needed since there's only one VM):

```bash
npm uninstall proper-lockfile @types/proper-lockfile
```

- [ ] **Step 2: Verify build + tests still pass**

Run: `npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: bump version to 0.3.0, drop proper-lockfile, update description

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 8 — Final validation

### Task 8.1: Full test + build verification

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors)

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: ALL PASS (e2e test is `describe.skipIf(!E2E)` so it skips automatically)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Sanity-check the CLI**

Run: `node dist/cli.js --help`
Expected: lists all 11 commands (bake, rebuild, up, down, pause, resume, destroy, ssh, attach, status, logs, secret).

Run: `node dist/cli.js secret --help`
Expected: lists set/list/rm subcommands.

- [ ] **Step 5: Commit anything left**

```bash
git status
# if anything is uncommitted, decide whether it belongs in the last task or its own commit
```

### Task 8.2: Merge to master

- [ ] **Step 1: Confirm clean working tree**

Run: `git status`
Expected: nothing to commit.

- [ ] **Step 2: Stop and report**

Do not auto-merge. Surface the branch + commit summary to the user and ask whether to:
- Open a PR (per project conventions, `--no-ff` merge to master)
- Merge locally with `git merge --no-ff feat/personal-dev-box`
- Continue iterating on the branch

---

## Self-review (done — applied inline)

**Spec coverage check:**

| Spec section | Covered by |
|---|---|
| §1 Goal | Plan as a whole |
| §2 Constraints | Phase 0–8 collectively |
| §3.1 Layers | Task 3.6 (base image), 1.1–1.5 (manifest), 1.1 + 1.4 (personal layer volume OR mount) |
| §3.2 Boundaries | Task 5.4 (ssh + attach), 3.1 (SDK builder), 4.x (msb wrapper) |
| §3.3 Why this shape | Implicit — backend is thin |
| §4.1 Manifest resolver | Tasks 1.1–1.5 |
| §4.2 Box backend | Tasks 3.1–3.7 |
| §4.3 Secrets | Tasks 2.1–2.3 |
| §4.4 Commands | Tasks 5.1–5.7 + 6.1 |
| §4.5 What goes away | Task 0.1 |
| §5 Manifest format | Tasks 1.1, 1.2 |
| §6 Flows | Verified by E2E in Task 7.1 + command tests |
| §7 Error handling | Schema (1.2), keychain tolerance (2.1), missing-host warning (resolve), rebuild fallback (3.7), bake failure (3.6) |
| §8 Testing | Every task has unit tests; integration in 7.1 |
| §9 Out of scope | Reflected (no GPU/snapshot-live/host-proxy/multi-host/X11 tasks) |
| §10 Migration | No automated migration task — matches spec |
| §11 Open questions | Not blocking; carried as followups |

**Placeholder scan:** None remaining (all "TODO/TBD/similar to Task N" patterns avoided; every step has concrete code or commands).

**Type consistency check:**
- `loadBox()` returns `ResolvedBox` (Tasks 1.5, used in 5.1–5.7) ✓
- `ResolvedBox.box.name` referenced consistently across commands ✓
- `WorkloadSecret { name, domain }` shape consistent (1.1, 1.2, 2.2, 2.3) ✓
- `PersonalLayer` discriminated union consistent (1.1, 1.2, 1.4, 3.1, 3.6) ✓
- `boxStatus` return type `"missing" | "running" | "stopped"` consistent (3.3, 3.7, 5.5) ✓

No issues found.

---

## Execution handoff

This plan is for **subagent-driven execution** (per the global instruction to delegate work). Phases run sequentially; tasks within a phase that touch disjoint files can be parallelized (e.g. the five agent install fragments in Task 4.2 are independent of toolchain fragments in Task 4.1).

Recommended dispatch shape:
- Phase 0 — one subagent (sequential setup)
- Phase 1 — one subagent per task (1.1 → 1.5 must be sequential; later tasks depend on earlier types)
- Phase 2 — three subagents (2.1, 2.2, 2.3 sequential due to dependency)
- Phase 3 — parallel: {3.1, 3.2, 3.3, 3.5} then sequential {3.4, 3.6, 3.7}
- Phase 4 — parallel: {4.1, 4.2}, then 4.3, then 4.4
- Phase 5 — parallel: {5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7}
- Phase 6 — one subagent
- Phase 7 — one subagent per task
- Phase 8 — driver agent verifies

Estimated wall-clock with full parallelism: 4–6 hours of subagent work.
