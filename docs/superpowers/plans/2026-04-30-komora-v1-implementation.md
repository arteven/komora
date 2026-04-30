# Komora V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `komora` V1 CLI: a thin TypeScript wrapper around `microsandbox` that gives AI coding agents reproducible per-workspace microVMs, with a Docker-`sbx`-style lifecycle (`run`/`create`/`start`/`stop`/`rm`/`exec`), profiles, repo config, and a komora-owned secret store.

**Architecture:** Single npm package, TypeScript strict, CLI built on `commander`. Sandbox lifecycle goes through a thin `sandbox/msb.ts` adapter (microsandbox SDK preferred, `msb` subprocess fallback). Config is YAML, validated by AJV against JSON Schemas that are also published to `schema/` for editor IntelliSense. Profiles discovered repo-local → user-global → bundled built-ins. Secrets stored in `~/.config/komora/secrets.json` (mode `0600`) and translated to `msb` secret flags only when the resolved profile policy allows. A `flock`-style lock guards the `lookup→create→spawn` window. Stderr-only logs, verbatim exit codes, native PTY signal forwarding.

**Tech Stack:** TypeScript, Node 20+, `commander` (CLI), `js-yaml` (parser), `ajv` + `ajv-formats` (schema validation), `proper-lockfile` (locking), `node-pty` (TTY/PTY + signal forwarding), `vitest` (tests), `execa` (subprocess for `msb` fallback). Microsandbox accessed via its published JS SDK (`microsandbox` npm package) with `execa`-based `msb` fallback when the SDK lacks coverage.

**Spec source of truth:** `docs/superpowers/specs/2026-04-30-komora-v1-design.md`

---

## Phase 0 — Verify DinD Feasibility (Spike)

The spec calls this out as the V1 verification gap. **Do not start the built-in `nodejs` / `python` profiles before this passes.** This phase produces a written report only, no shipping code.

### Task 0.1: DinD-inside-microsandbox spike

**Files:**
- Create: `docs/spike-dind-feasibility.md`

- [ ] **Step 1: Install microsandbox locally**

Run (only if `msb --version` is not already on PATH):
```bash
curl -fsSL https://get.microsandbox.dev | sh
msb --version
```
Expected: a version string. If install fails, stop and report — komora cannot proceed without `msb`.

- [ ] **Step 2: Pull a `docker:dind`-style image into a microsandbox VM and try to start `dockerd`**

Run:
```bash
msb run -i docker:dind --name dind-spike -- sh -c 'dockerd > /tmp/d.log 2>&1 & sleep 5 && docker info'
```
Expected outcomes to record:
- PASS: `docker info` returns server info → DinD works, document required flags.
- FAIL with permission/cap error → record the exact error; check whether `msb` exposes `--privileged` or equivalent.
- FAIL with kernel-feature error (cgroup v2, overlayfs) → record and note this blocks the DinD pattern.

- [ ] **Step 3: If step 2 failed, try the next variant**

Try `msb run --privileged …` (if the flag exists), then a startup script that runs `dockerd --storage-driver=vfs` (slow but no overlay needed). Record results.

- [ ] **Step 4: Write the report**

Create `docs/spike-dind-feasibility.md` with:
- Microsandbox version tested.
- Image and exact `msb` invocation that worked (or didn't).
- A minimal reproducer.
- Verdict: **WORKS** / **WORKS WITH FLAGS X** / **DOES NOT WORK ON V1**.
- If WORKS: the exact `raw:` block a profile needs to enable DinD.
- If DOES NOT WORK: the recommendation for V1 (likely: ship `nodejs`/`python` without DinD; note MCP-via-DinD as V2).

- [ ] **Step 5: Commit**

```bash
git add docs/spike-dind-feasibility.md
git commit -m "docs: record DinD-in-microsandbox feasibility spike"
```

---

## Phase 1 — Project Scaffolding

### Task 1.1: npm package + TypeScript scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `vitest.config.ts`, `src/cli.ts`, `tests/smoke.test.ts`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "komora",
  "version": "0.0.0",
  "description": "Per-workspace microVM sandboxes for AI coding agents.",
  "type": "module",
  "bin": { "komora": "./dist/cli.js" },
  "scripts": {
    "build": "tsc -p .",
    "dev": "tsx src/cli.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p . --noEmit",
    "lint": "tsc -p . --noEmit"
  },
  "engines": { "node": ">=20" },
  "dependencies": {
    "ajv": "^8.17.1",
    "ajv-formats": "^3.0.1",
    "commander": "^12.1.0",
    "execa": "^9.5.1",
    "js-yaml": "^4.1.0",
    "node-pty": "^1.0.0",
    "proper-lockfile": "^4.1.2"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^20.16.0",
    "@types/proper-lockfile": "^4.1.4",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.5"
  },
  "files": ["dist/", "src/profiles/builtin/", "schema/"]
}
```

Note: the `microsandbox` SDK is intentionally **not** added in this task. It is added in Task 5.1 once we know the package name from the spike report.

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `.gitignore`**

```
node_modules/
dist/
*.log
.DS_Store
HANDOFF.md
```

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 5: Write the smoke test**

`tests/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Write a stub CLI entry**

`src/cli.ts`:
```ts
#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();
program.name("komora").description("Per-workspace microVM sandboxes for AI agents.").version("0.0.0");
program.parseAsync(process.argv);
```

- [ ] **Step 7: Install and verify**

Run:
```bash
npm install
npm run typecheck
npm test
npx tsx src/cli.ts --version
```
Expected: typecheck clean, smoke test passes, version prints `0.0.0`.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore vitest.config.ts src/cli.ts tests/smoke.test.ts
git commit -m "chore: scaffold typescript npm package with vitest"
```

---

## Phase 2 — Pure Helpers (no I/O)

These have no external dependencies and are easy to test exhaustively. Build them first so later phases can rely on them.

### Task 2.1: Workspace slug derivation

**Files:**
- Create: `src/util/workspace.ts`, `tests/util/workspace.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/util/workspace.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { workspaceSlug } from "../../src/util/workspace.js";

describe("workspaceSlug", () => {
  it("uses the last path segment", () => {
    expect(workspaceSlug("/home/arek/code/foo")).toBe("foo");
  });

  it("strips trailing slashes", () => {
    expect(workspaceSlug("/home/arek/code/foo/")).toBe("foo");
  });

  it("lowercases and replaces non-alphanumeric runs with single dashes", () => {
    expect(workspaceSlug("/tmp/My Project!")).toBe("my-project");
  });

  it("trims leading and trailing dashes", () => {
    expect(workspaceSlug("/tmp/--weird--")).toBe("weird");
  });

  it("falls back to 'workspace' when the segment slugifies to empty", () => {
    expect(workspaceSlug("/")).toBe("workspace");
    expect(workspaceSlug("/tmp/!!!")).toBe("workspace");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run tests/util/workspace.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/util/workspace.ts`:
```ts
import path from "node:path";

export function workspaceSlug(cwd: string): string {
  const last = path.basename(path.resolve(cwd));
  const slug = last.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "workspace";
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run tests/util/workspace.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/util/workspace.ts tests/util/workspace.test.ts
git commit -m "feat(util): derive workspace slug from cwd"
```

### Task 2.2: Sandbox naming

**Files:**
- Create: `src/sandbox/naming.ts`, `tests/sandbox/naming.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/sandbox/naming.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { sandboxName } from "../../src/sandbox/naming.js";

describe("sandboxName", () => {
  it("joins workspace, agent, profile with dashes", () => {
    expect(sandboxName({ workspaceSlug: "foo", agent: "claude", profile: "nodejs" }))
      .toBe("foo-claude-nodejs");
  });

  it("uses the override when provided", () => {
    expect(sandboxName({ workspaceSlug: "foo", agent: "claude", profile: "nodejs", override: "custom" }))
      .toBe("custom");
  });

  it("rejects an empty override", () => {
    expect(() => sandboxName({ workspaceSlug: "foo", agent: "claude", profile: "nodejs", override: "" }))
      .toThrow(/override.*empty/i);
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run tests/sandbox/naming.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/sandbox/naming.ts`:
```ts
export interface NameInput {
  workspaceSlug: string;
  agent: string;
  profile: string;
  override?: string;
}

export function sandboxName(input: NameInput): string {
  if (input.override !== undefined) {
    if (input.override.length === 0) throw new Error("--name override must not be empty");
    return input.override;
  }
  return `${input.workspaceSlug}-${input.agent}-${input.profile}`;
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run tests/sandbox/naming.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/sandbox/naming.ts tests/sandbox/naming.test.ts
git commit -m "feat(sandbox): deterministic sandbox naming"
```

### Task 2.3: XDG-ish paths

**Files:**
- Create: `src/util/paths.ts`, `tests/util/paths.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/util/paths.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { configDir, stateDir, secretsFile, lockFile, userProfilesDir } from "../../src/util/paths.js";

describe("paths", () => {
  const originalEnv = { ...process.env };
  beforeEach(() => { process.env = { ...originalEnv }; });
  afterEach(() => { process.env = originalEnv; });

  it("uses XDG_CONFIG_HOME when set", () => {
    process.env.XDG_CONFIG_HOME = "/tmp/xdg-config";
    expect(configDir()).toBe("/tmp/xdg-config/komora");
    expect(secretsFile()).toBe("/tmp/xdg-config/komora/secrets.json");
    expect(userProfilesDir()).toBe("/tmp/xdg-config/komora/profiles");
  });

  it("falls back to $HOME/.config when XDG unset", () => {
    delete process.env.XDG_CONFIG_HOME;
    process.env.HOME = "/home/u";
    expect(configDir()).toBe("/home/u/.config/komora");
  });

  it("uses XDG_STATE_HOME when set", () => {
    process.env.XDG_STATE_HOME = "/tmp/xdg-state";
    expect(stateDir()).toBe("/tmp/xdg-state/komora");
  });

  it("falls back to $HOME/.local/state when XDG_STATE_HOME unset", () => {
    delete process.env.XDG_STATE_HOME;
    process.env.HOME = "/home/u";
    expect(stateDir()).toBe("/home/u/.local/state/komora");
  });

  it("builds lock file paths under stateDir/locks/", () => {
    process.env.XDG_STATE_HOME = "/tmp/xdg-state";
    expect(lockFile("foo-claude-nodejs")).toBe(path.join("/tmp/xdg-state/komora/locks", "foo-claude-nodejs.lock"));
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run tests/util/paths.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/util/paths.ts`:
```ts
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

export function secretsFile(): string {
  return path.join(configDir(), "secrets.json");
}

export function userProfilesDir(): string {
  return path.join(configDir(), "profiles");
}

export function lockFile(sandboxName: string): string {
  return path.join(stateDir(), "locks", `${sandboxName}.lock`);
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run tests/util/paths.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/util/paths.ts tests/util/paths.test.ts
git commit -m "feat(util): xdg-aware config and state paths"
```

### Task 2.4: Stderr-only logger

**Files:**
- Create: `src/util/log.ts`, `tests/util/log.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/util/log.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { log } from "../../src/util/log.js";

describe("log", () => {
  it("writes to stderr, never stdout", () => {
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    log.info("hello");
    log.warn("careful");
    log.error("bad");

    expect(out).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledTimes(3);
    err.mockRestore();
    out.mockRestore();
  });

  it("prefixes lines with komora:", () => {
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    log.info("hi");
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/^komora: hi\n$/));
    err.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run tests/util/log.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/util/log.ts`:
```ts
function write(level: "info" | "warn" | "error", msg: string): void {
  const prefix = level === "info" ? "komora" : `komora ${level}`;
  process.stderr.write(`${prefix}: ${msg}\n`);
}

export const log = {
  info: (m: string) => write("info", m),
  warn: (m: string) => write("warn", m),
  error: (m: string) => write("error", m),
};
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run tests/util/log.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add src/util/log.ts tests/util/log.test.ts
git commit -m "feat(util): stderr-only logger"
```

---

## Phase 3 — Config & Profiles

### Task 3.1: Config and profile types

**Files:**
- Create: `src/config/types.ts`

- [ ] **Step 1: Write the type module (no test — types only, downstream tasks exercise them)**

`src/config/types.ts`:
```ts
export interface Mount {
  type: "bind" | "volume";
  source?: string;        // bind only
  name?: string;          // volume only
  target: string;
}

export interface SecretAllowance {
  name: string;
  hosts?: string[];
  requireTls?: boolean;
  onViolation?: "error";
}

export interface NetworkBlock {
  allowedDomains?: string[];
  serviceDomains?: Record<string, string>;
}

export interface Profile {
  name: string;
  image: string;
  env?: Record<string, string>;
  mounts?: Mount[];
  secrets?: { allowed?: SecretAllowance[] };
  startup?: string[];
  network?: NetworkBlock;  // V1 ignores with warning, reserved for V2 kit-compat
  digest?: string;         // V1 ignores with warning
}

export interface RepoConfig {
  agent: string;
  profile: string;
  env?: Record<string, string>;
  mounts?: Mount[];
  secrets?: { allow?: string[] };
  network?: NetworkBlock;  // V1 ignores with warning
  raw?: Record<string, unknown>;
}

export interface ResolvedConfig {
  agent: string;
  profile: Profile;        // post-merge: env, mounts, secrets, startup all applied
  raw: Record<string, unknown>;
  workspaceDir: string;
  workspaceSlug: string;
  sandboxName: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/config/types.ts
git commit -m "feat(config): type definitions for profile and repo config"
```

### Task 3.2: JSON Schemas (profile + repo config)

**Files:**
- Create: `src/config/profile-schema.ts`, `src/config/schema.ts`, `schema/profile.v1.json`, `schema/komora.config.v1.json`, `tests/config/schema.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/config/schema.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { profileSchema } from "../../src/config/profile-schema.js";
import { repoConfigSchema } from "../../src/config/schema.js";

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

describe("profileSchema", () => {
  const validate = ajv.compile(profileSchema);

  it("accepts a minimal valid profile", () => {
    expect(validate({ name: "n", image: "img:tag" })).toBe(true);
  });

  it("rejects a profile missing image", () => {
    expect(validate({ name: "n" })).toBe(false);
  });

  it("rejects an unknown top-level field", () => {
    expect(validate({ name: "n", image: "i", bogus: 1 })).toBe(false);
  });

  it("accepts secrets.allowed entries with hosts and requireTls", () => {
    expect(validate({
      name: "n",
      image: "i",
      secrets: { allowed: [{ name: "X", hosts: ["a"], requireTls: true }] },
    })).toBe(true);
  });
});

describe("repoConfigSchema", () => {
  const validate = ajv.compile(repoConfigSchema);

  it("accepts a minimal valid config", () => {
    expect(validate({ agent: "claude", profile: "nodejs" })).toBe(true);
  });

  it("rejects without agent", () => {
    expect(validate({ profile: "nodejs" })).toBe(false);
  });

  it("allows raw passthrough as an object", () => {
    expect(validate({ agent: "claude", profile: "nodejs", raw: { cpus: 4 } })).toBe(true);
  });

  it("rejects raw as a non-object", () => {
    expect(validate({ agent: "claude", profile: "nodejs", raw: "x" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run tests/config/schema.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/config/profile-schema.ts`**

```ts
export const profileSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://komora.dev/schema/profile/v1.json",
  type: "object",
  additionalProperties: false,
  required: ["name", "image"],
  properties: {
    name: { type: "string", minLength: 1 },
    image: { type: "string", minLength: 1 },
    digest: { type: "string" },
    env: { type: "object", additionalProperties: { type: "string" } },
    mounts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "target"],
        properties: {
          type: { enum: ["bind", "volume"] },
          source: { type: "string" },
          name: { type: "string" },
          target: { type: "string", minLength: 1 },
        },
      },
    },
    secrets: {
      type: "object",
      additionalProperties: false,
      properties: {
        allowed: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name"],
            properties: {
              name: { type: "string", minLength: 1 },
              hosts: { type: "array", items: { type: "string" } },
              requireTls: { type: "boolean" },
              onViolation: { enum: ["error"] },
            },
          },
        },
      },
    },
    startup: { type: "array", items: { type: "string" } },
    network: {
      type: "object",
      additionalProperties: false,
      properties: {
        allowedDomains: { type: "array", items: { type: "string" } },
        serviceDomains: { type: "object", additionalProperties: { type: "string" } },
      },
    },
  },
} as const;
```

- [ ] **Step 4: Implement `src/config/schema.ts`**

```ts
export const repoConfigSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://komora.dev/schema/v1.json",
  type: "object",
  additionalProperties: false,
  required: ["agent", "profile"],
  properties: {
    agent: { type: "string", minLength: 1 },
    profile: { type: "string", minLength: 1 },
    env: { type: "object", additionalProperties: { type: "string" } },
    mounts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "target"],
        properties: {
          type: { enum: ["bind", "volume"] },
          source: { type: "string" },
          name: { type: "string" },
          target: { type: "string", minLength: 1 },
        },
      },
    },
    secrets: {
      type: "object",
      additionalProperties: false,
      properties: {
        allow: { type: "array", items: { type: "string" } },
      },
    },
    network: {
      type: "object",
      additionalProperties: false,
      properties: {
        allowedDomains: { type: "array", items: { type: "string" } },
        serviceDomains: { type: "object", additionalProperties: { type: "string" } },
      },
    },
    raw: { type: "object" },
  },
} as const;
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `npx vitest run tests/config/schema.test.ts`
Expected: PASS (8/8).

- [ ] **Step 6: Generate the public schema files**

Create `schema/profile.v1.json` and `schema/komora.config.v1.json` by writing the same JSON literal (export the const as JSON). Use a tiny script or paste verbatim. The files must match `src/config/*-schema.ts` byte-for-byte (modulo formatting).

- [ ] **Step 7: Commit**

```bash
git add src/config/profile-schema.ts src/config/schema.ts schema/profile.v1.json schema/komora.config.v1.json tests/config/schema.test.ts
git commit -m "feat(config): json schemas for profile and repo config"
```

### Task 3.3: Profile discovery

**Files:**
- Create: `src/profiles/discovery.ts`, `tests/profiles/discovery.test.ts`, `src/profiles/builtin/.gitkeep`

- [ ] **Step 1: Write the failing test**

`tests/profiles/discovery.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { findProfile } from "../../src/profiles/discovery.js";

async function tmpdir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "komora-disc-"));
}

describe("findProfile", () => {
  let workdir: string;
  let configHome: string;

  beforeEach(async () => {
    workdir = await tmpdir();
    configHome = await tmpdir();
    process.env.XDG_CONFIG_HOME = configHome;
  });

  afterEach(async () => {
    delete process.env.XDG_CONFIG_HOME;
    await fs.rm(workdir, { recursive: true, force: true });
    await fs.rm(configHome, { recursive: true, force: true });
  });

  it("prefers repo-local over user-global", async () => {
    await fs.mkdir(path.join(workdir, ".komora", "profiles"), { recursive: true });
    await fs.writeFile(path.join(workdir, ".komora", "profiles", "p.yaml"), "from: repo\n");
    await fs.mkdir(path.join(configHome, "komora", "profiles"), { recursive: true });
    await fs.writeFile(path.join(configHome, "komora", "profiles", "p.yaml"), "from: user\n");

    const found = await findProfile("p", { workspaceDir: workdir });
    expect(found.source).toBe("repo");
    expect(found.path).toBe(path.join(workdir, ".komora", "profiles", "p.yaml"));
  });

  it("falls back to user-global", async () => {
    await fs.mkdir(path.join(configHome, "komora", "profiles"), { recursive: true });
    await fs.writeFile(path.join(configHome, "komora", "profiles", "p.yaml"), "from: user\n");

    const found = await findProfile("p", { workspaceDir: workdir });
    expect(found.source).toBe("user");
  });

  it("falls back to built-in", async () => {
    const found = await findProfile("__builtin_test__", {
      workspaceDir: workdir,
      builtinDir: path.join(workdir, "_builtin"),
    });
    await fs.mkdir(path.join(workdir, "_builtin"), { recursive: true });
    await fs.writeFile(path.join(workdir, "_builtin", "__builtin_test__.yaml"), "from: builtin\n");

    const found2 = await findProfile("__builtin_test__", {
      workspaceDir: workdir,
      builtinDir: path.join(workdir, "_builtin"),
    });
    expect(found2.source).toBe("builtin");
  });

  it("throws when no profile is found", async () => {
    await expect(findProfile("ghost", { workspaceDir: workdir })).rejects.toThrow(/profile.*not found/i);
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run tests/profiles/discovery.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/profiles/builtin/.gitkeep` (empty).

`src/profiles/discovery.ts`:
```ts
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { userProfilesDir } from "../util/paths.js";

export interface FoundProfile {
  source: "repo" | "user" | "builtin";
  path: string;
}

export interface FindOptions {
  workspaceDir: string;
  builtinDir?: string;
}

const defaultBuiltinDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "builtin");

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

export async function findProfile(name: string, opts: FindOptions): Promise<FoundProfile> {
  const candidates: Array<{ source: FoundProfile["source"]; path: string }> = [
    { source: "repo", path: path.join(opts.workspaceDir, ".komora", "profiles", `${name}.yaml`) },
    { source: "user", path: path.join(userProfilesDir(), `${name}.yaml`) },
    { source: "builtin", path: path.join(opts.builtinDir ?? defaultBuiltinDir, `${name}.yaml`) },
  ];
  for (const c of candidates) {
    if (await exists(c.path)) return c;
  }
  throw new Error(`profile '${name}' not found in repo, user, or built-in locations`);
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run tests/profiles/discovery.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/profiles/discovery.ts src/profiles/builtin/.gitkeep tests/profiles/discovery.test.ts
git commit -m "feat(profiles): layered discovery repo > user > builtin"
```

### Task 3.4: Config loader (parse + validate)

**Files:**
- Create: `src/config/load.ts`, `tests/config/load.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/config/load.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseProfile, parseRepoConfig } from "../../src/config/load.js";

describe("parseProfile", () => {
  it("parses a minimal valid YAML", () => {
    const p = parseProfile("name: n\nimage: i:t\n");
    expect(p.name).toBe("n");
    expect(p.image).toBe("i:t");
  });

  it("throws with a clear message on schema violation", () => {
    expect(() => parseProfile("name: n\n")).toThrow(/image/);
  });

  it("throws on invalid YAML", () => {
    expect(() => parseProfile(":\n  -")).toThrow();
  });
});

describe("parseRepoConfig", () => {
  it("parses a minimal valid YAML", () => {
    const c = parseRepoConfig("agent: claude\nprofile: nodejs\n");
    expect(c.agent).toBe("claude");
    expect(c.profile).toBe("nodejs");
  });

  it("throws when agent missing", () => {
    expect(() => parseRepoConfig("profile: nodejs\n")).toThrow(/agent/);
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run tests/config/load.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/config/load.ts`:
```ts
import yaml from "js-yaml";
import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { profileSchema } from "./profile-schema.js";
import { repoConfigSchema } from "./schema.js";
import type { Profile, RepoConfig } from "./types.js";

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validateProfile = ajv.compile<Profile>(profileSchema);
const validateRepoConfig = ajv.compile<RepoConfig>(repoConfigSchema);

function formatErrors(errs: ErrorObject[] | null | undefined): string {
  if (!errs?.length) return "validation failed";
  return errs.map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim()).join("; ");
}

export function parseProfile(src: string): Profile {
  const parsed = yaml.load(src);
  if (!validateProfile(parsed)) throw new Error(`profile invalid: ${formatErrors(validateProfile.errors)}`);
  return parsed as Profile;
}

export function parseRepoConfig(src: string): RepoConfig {
  const parsed = yaml.load(src);
  if (!validateRepoConfig(parsed)) throw new Error(`komora.config.yaml invalid: ${formatErrors(validateRepoConfig.errors)}`);
  return parsed as RepoConfig;
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run tests/config/load.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/config/load.ts tests/config/load.test.ts
git commit -m "feat(config): yaml parser with ajv validation"
```

### Task 3.5: Config resolver (merge profile + repo + flags)

**Files:**
- Create: `src/config/resolve.ts`, `tests/config/resolve.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/config/resolve.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { resolveConfig } from "../../src/config/resolve.js";
import type { Profile, RepoConfig } from "../../src/config/types.js";

const baseProfile: Profile = {
  name: "nodejs",
  image: "img:t",
  env: { A: "1", B: "2" },
  mounts: [{ type: "bind", source: "${WORKSPACE}", target: "/workspace" }],
  secrets: { allowed: [{ name: "GITHUB_TOKEN" }] },
};

describe("resolveConfig", () => {
  it("merges env with repo overriding profile", () => {
    const r = resolveConfig({
      profile: baseProfile,
      repoConfig: { agent: "claude", profile: "nodejs", env: { B: "x", C: "3" } },
      workspaceDir: "/tmp/foo",
      workspaceSlug: "foo",
    });
    expect(r.profile.env).toEqual({ A: "1", B: "x", C: "3" });
  });

  it("appends repo mounts to profile mounts", () => {
    const r = resolveConfig({
      profile: baseProfile,
      repoConfig: {
        agent: "claude",
        profile: "nodejs",
        mounts: [{ type: "volume", name: "extra", target: "/extra" }],
      },
      workspaceDir: "/tmp/foo",
      workspaceSlug: "foo",
    });
    expect(r.profile.mounts).toHaveLength(2);
    expect(r.profile.mounts?.[1].target).toBe("/extra");
  });

  it("substitutes ${WORKSPACE} in mount sources", () => {
    const r = resolveConfig({
      profile: baseProfile,
      repoConfig: { agent: "claude", profile: "nodejs" },
      workspaceDir: "/tmp/foo",
      workspaceSlug: "foo",
    });
    expect(r.profile.mounts?.[0].source).toBe("/tmp/foo");
  });

  it("opts in to allowed secrets via repo config", () => {
    const r = resolveConfig({
      profile: baseProfile,
      repoConfig: { agent: "claude", profile: "nodejs", secrets: { allow: ["GITHUB_TOKEN"] } },
      workspaceDir: "/tmp/foo",
      workspaceSlug: "foo",
    });
    expect(r.profile.secrets?.allowed?.map((s) => s.name)).toContain("GITHUB_TOKEN");
  });

  it("rejects opting in to a secret the profile did not declare", () => {
    expect(() => resolveConfig({
      profile: baseProfile,
      repoConfig: { agent: "claude", profile: "nodejs", secrets: { allow: ["MYSTERY"] } },
      workspaceDir: "/tmp/foo",
      workspaceSlug: "foo",
    })).toThrow(/MYSTERY.*not declared/i);
  });

  it("warns and ignores profile.digest", () => {
    const warn = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    resolveConfig({
      profile: { ...baseProfile, digest: "sha256:abc" },
      repoConfig: { agent: "claude", profile: "nodejs" },
      workspaceDir: "/tmp/foo",
      workspaceSlug: "foo",
    });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/digest.*ignored/i));
    warn.mockRestore();
  });

  it("warns and ignores a non-empty network block (v2-reserved)", () => {
    const warn = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    resolveConfig({
      profile: { ...baseProfile, network: { allowedDomains: ["github.com"] } },
      repoConfig: { agent: "claude", profile: "nodejs" },
      workspaceDir: "/tmp/foo",
      workspaceSlug: "foo",
    });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/network.*ignored/i));
    warn.mockRestore();
  });

  it("errors when raw conflicts with a komora-modeled field", () => {
    expect(() => resolveConfig({
      profile: baseProfile,
      repoConfig: { agent: "claude", profile: "nodejs", raw: { env: { X: "y" } } },
      workspaceDir: "/tmp/foo",
      workspaceSlug: "foo",
    })).toThrow(/raw.*env.*conflict/i);
  });

  it("computes deterministic sandbox name", () => {
    const r = resolveConfig({
      profile: baseProfile,
      repoConfig: { agent: "claude", profile: "nodejs" },
      workspaceDir: "/tmp/foo",
      workspaceSlug: "foo",
    });
    expect(r.sandboxName).toBe("foo-claude-nodejs");
  });

  it("uses --name override for sandbox name", () => {
    const r = resolveConfig({
      profile: baseProfile,
      repoConfig: { agent: "claude", profile: "nodejs" },
      workspaceDir: "/tmp/foo",
      workspaceSlug: "foo",
      nameOverride: "custom",
    });
    expect(r.sandboxName).toBe("custom");
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run tests/config/resolve.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/config/resolve.ts`:
```ts
import type { Profile, RepoConfig, ResolvedConfig } from "./types.js";
import { sandboxName } from "../sandbox/naming.js";
import { log } from "../util/log.js";

const RAW_CONFLICT_KEYS = new Set(["env", "mounts", "secrets", "image", "name", "startup"]);

export interface ResolveInput {
  profile: Profile;
  repoConfig: RepoConfig;
  workspaceDir: string;
  workspaceSlug: string;
  nameOverride?: string;
}

function substituteWorkspace(s: string, workspaceDir: string): string {
  return s.replace(/\$\{WORKSPACE\}/g, workspaceDir);
}

export function resolveConfig(input: ResolveInput): ResolvedConfig {
  const { profile, repoConfig, workspaceDir, workspaceSlug, nameOverride } = input;

  if (profile.digest) {
    log.warn(`profile '${profile.name}': 'digest' field is reserved for V2 and is ignored`);
  }

  const profileNetNonEmpty =
    !!profile.network && (
      (profile.network.allowedDomains?.length ?? 0) > 0 ||
      Object.keys(profile.network.serviceDomains ?? {}).length > 0
    );
  const repoNetNonEmpty =
    !!repoConfig.network && (
      (repoConfig.network.allowedDomains?.length ?? 0) > 0 ||
      Object.keys(repoConfig.network.serviceDomains ?? {}).length > 0
    );
  if (profileNetNonEmpty || repoNetNonEmpty) {
    log.warn(`'network' block is reserved for V2 (kit-compat) and is ignored`);
  }

  const env = { ...(profile.env ?? {}), ...(repoConfig.env ?? {}) };

  const profileMounts = (profile.mounts ?? []).map((m) =>
    m.source ? { ...m, source: substituteWorkspace(m.source, workspaceDir) } : m,
  );
  const mounts = [...profileMounts, ...(repoConfig.mounts ?? [])];

  const declared = new Set((profile.secrets?.allowed ?? []).map((s) => s.name));
  for (const name of repoConfig.secrets?.allow ?? []) {
    if (!declared.has(name)) {
      throw new Error(`repo config secrets.allow: '${name}' is not declared in profile '${profile.name}'`);
    }
  }

  const raw = repoConfig.raw ?? {};
  for (const key of Object.keys(raw)) {
    if (RAW_CONFLICT_KEYS.has(key)) {
      throw new Error(`raw.${key}: conflicts with komora-modeled field; remove it or use the typed field`);
    }
  }

  const merged: Profile = { ...profile, env, mounts };
  return {
    agent: repoConfig.agent,
    profile: merged,
    raw,
    workspaceDir,
    workspaceSlug,
    sandboxName: sandboxName({ workspaceSlug, agent: repoConfig.agent, profile: profile.name, override: nameOverride }),
  };
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run tests/config/resolve.test.ts`
Expected: PASS (10/10).

- [ ] **Step 5: Commit**

```bash
git add src/config/resolve.ts tests/config/resolve.test.ts
git commit -m "feat(config): resolver merges profile, repo config, and flags"
```

### Task 3.6: Top-level config-loading function

**Files:**
- Create: `src/config/index.ts`, `tests/config/index.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/config/index.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadResolvedConfig } from "../../src/config/index.js";

describe("loadResolvedConfig", () => {
  let workdir: string;
  let configHome: string;

  beforeEach(async () => {
    workdir = await fs.mkdtemp(path.join(os.tmpdir(), "komora-cfg-"));
    configHome = await fs.mkdtemp(path.join(os.tmpdir(), "komora-home-"));
    process.env.XDG_CONFIG_HOME = configHome;
  });

  afterEach(async () => {
    delete process.env.XDG_CONFIG_HOME;
    await fs.rm(workdir, { recursive: true, force: true });
    await fs.rm(configHome, { recursive: true, force: true });
  });

  it("loads repo config + profile and returns ResolvedConfig", async () => {
    await fs.writeFile(path.join(workdir, "komora.config.yaml"), "agent: claude\nprofile: minimal\n");
    await fs.mkdir(path.join(workdir, ".komora", "profiles"), { recursive: true });
    await fs.writeFile(path.join(workdir, ".komora", "profiles", "minimal.yaml"), "name: minimal\nimage: img:t\n");

    const r = await loadResolvedConfig({ workspaceDir: workdir });
    expect(r.agent).toBe("claude");
    expect(r.profile.image).toBe("img:t");
    expect(r.sandboxName.endsWith("-claude-minimal")).toBe(true);
  });

  it("uses --agent and --profile overrides when no repo config exists", async () => {
    await fs.mkdir(path.join(configHome, "komora", "profiles"), { recursive: true });
    await fs.writeFile(path.join(configHome, "komora", "profiles", "minimal.yaml"), "name: minimal\nimage: img:t\n");

    const r = await loadResolvedConfig({ workspaceDir: workdir, agentOverride: "claude", profileOverride: "minimal" });
    expect(r.agent).toBe("claude");
    expect(r.profile.name).toBe("minimal");
  });

  it("throws when no repo config and no agent/profile overrides", async () => {
    await expect(loadResolvedConfig({ workspaceDir: workdir })).rejects.toThrow(/no komora\.config\.yaml/i);
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run tests/config/index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/config/index.ts`:
```ts
import fs from "node:fs/promises";
import path from "node:path";
import { parseProfile, parseRepoConfig } from "./load.js";
import { findProfile } from "../profiles/discovery.js";
import { resolveConfig } from "./resolve.js";
import { workspaceSlug } from "../util/workspace.js";
import type { ResolvedConfig, RepoConfig } from "./types.js";

export interface LoadOptions {
  workspaceDir: string;
  agentOverride?: string;
  profileOverride?: string;
  nameOverride?: string;
}

async function readIfExists(p: string): Promise<string | null> {
  try { return await fs.readFile(p, "utf8"); } catch { return null; }
}

export async function loadResolvedConfig(opts: LoadOptions): Promise<ResolvedConfig> {
  const repoYaml = await readIfExists(path.join(opts.workspaceDir, "komora.config.yaml"));
  let repoConfig: RepoConfig;
  if (repoYaml) {
    repoConfig = parseRepoConfig(repoYaml);
    if (opts.agentOverride) repoConfig = { ...repoConfig, agent: opts.agentOverride };
    if (opts.profileOverride) repoConfig = { ...repoConfig, profile: opts.profileOverride };
  } else {
    if (!opts.agentOverride || !opts.profileOverride) {
      throw new Error("no komora.config.yaml found and --agent / --profile not provided");
    }
    repoConfig = { agent: opts.agentOverride, profile: opts.profileOverride };
  }

  const found = await findProfile(repoConfig.profile, { workspaceDir: opts.workspaceDir });
  const profile = parseProfile(await fs.readFile(found.path, "utf8"));

  return resolveConfig({
    profile,
    repoConfig,
    workspaceDir: opts.workspaceDir,
    workspaceSlug: workspaceSlug(opts.workspaceDir),
    nameOverride: opts.nameOverride,
  });
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run tests/config/index.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/config/index.ts tests/config/index.test.ts
git commit -m "feat(config): top-level loadResolvedConfig"
```

---

## Phase 4 — Secret Store

### Task 4.1: Secret store with 0600 mode

**Files:**
- Create: `src/secrets/store.ts`, `tests/secrets/store.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/secrets/store.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setSecret, listSecrets, removeSecret, getSecret } from "../../src/secrets/store.js";

describe("secrets store", () => {
  let configHome: string;

  beforeEach(async () => {
    configHome = await fs.mkdtemp(path.join(os.tmpdir(), "komora-sec-"));
    process.env.XDG_CONFIG_HOME = configHome;
  });

  afterEach(async () => {
    delete process.env.XDG_CONFIG_HOME;
    await fs.rm(configHome, { recursive: true, force: true });
  });

  it("set+list+get roundtrips", async () => {
    await setSecret("A", "alpha");
    await setSecret("B", "beta");
    expect((await listSecrets()).sort()).toEqual(["A", "B"]);
    expect(await getSecret("A")).toBe("alpha");
  });

  it("rm removes a secret", async () => {
    await setSecret("A", "alpha");
    await removeSecret("A");
    expect(await listSecrets()).toEqual([]);
    expect(await getSecret("A")).toBeUndefined();
  });

  it("creates secrets.json with mode 0600", async () => {
    await setSecret("A", "alpha");
    const stat = await fs.stat(path.join(configHome, "komora", "secrets.json"));
    expect((stat.mode & 0o777)).toBe(0o600);
  });

  it("creates configDir with mode 0700 when missing", async () => {
    await setSecret("A", "alpha");
    const stat = await fs.stat(path.join(configHome, "komora"));
    expect((stat.mode & 0o777)).toBe(0o700);
  });

  it("returns empty list when file does not exist", async () => {
    expect(await listSecrets()).toEqual([]);
  });

  it("rejects an empty name", async () => {
    await expect(setSecret("", "x")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run tests/secrets/store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/secrets/store.ts`:
```ts
import fs from "node:fs/promises";
import path from "node:path";
import { configDir, secretsFile } from "../util/paths.js";

async function readAll(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(secretsFile(), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return {};
    return parsed as Record<string, string>;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
}

async function writeAll(values: Record<string, string>): Promise<void> {
  const dir = configDir();
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  // Ensure dir mode even if it pre-existed.
  await fs.chmod(dir, 0o700).catch(() => undefined);
  const file = secretsFile();
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(values, null, 2), { mode: 0o600 });
  await fs.rename(tmp, file);
  await fs.chmod(file, 0o600).catch(() => undefined);
}

export async function setSecret(name: string, value: string): Promise<void> {
  if (!name) throw new Error("secret name must not be empty");
  const all = await readAll();
  all[name] = value;
  await writeAll(all);
}

export async function removeSecret(name: string): Promise<void> {
  const all = await readAll();
  delete all[name];
  await writeAll(all);
}

export async function listSecrets(): Promise<string[]> {
  return Object.keys(await readAll()).sort();
}

export async function getSecret(name: string): Promise<string | undefined> {
  return (await readAll())[name];
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run tests/secrets/store.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add src/secrets/store.ts tests/secrets/store.test.ts
git commit -m "feat(secrets): mode-0600 secret store with set/list/rm/get"
```

### Task 4.2: Secret policy → msb args

**Files:**
- Create: `src/secrets/policy.ts`, `tests/secrets/policy.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/secrets/policy.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { resolveSecretArgs } from "../../src/secrets/policy.js";
import type { Profile } from "../../src/config/types.js";

const profile = (allowed: Profile["secrets"]["allowed"]): Profile => ({
  name: "p", image: "i:t", secrets: { allowed },
});

describe("resolveSecretArgs", () => {
  it("emits NAME=VALUE@HOST when hosts are listed", () => {
    const args = resolveSecretArgs({
      profile: profile([{ name: "T", hosts: ["a.com", "b.com"] }]),
      values: { T: "v" },
    });
    expect(args).toEqual(["--secret", "T=v@a.com", "--secret", "T=v@b.com"]);
  });

  it("emits NAME=VALUE with no host suffix when hosts is empty/absent", () => {
    const args = resolveSecretArgs({
      profile: profile([{ name: "T" }]),
      values: { T: "v" },
    });
    expect(args).toEqual(["--secret", "T=v"]);
  });

  it("skips secrets that are allowed but have no stored value", () => {
    const args = resolveSecretArgs({
      profile: profile([{ name: "T" }]),
      values: {},
    });
    expect(args).toEqual([]);
  });

  it("ignores stored values not in the allowed list", () => {
    const args = resolveSecretArgs({
      profile: profile([{ name: "T" }]),
      values: { T: "v", OTHER: "leaked" },
    });
    expect(args).toEqual(["--secret", "T=v"]);
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run tests/secrets/policy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/secrets/policy.ts`:
```ts
import type { Profile } from "../config/types.js";

export interface ResolveInput {
  profile: Profile;
  values: Record<string, string>;
}

export function resolveSecretArgs(input: ResolveInput): string[] {
  const out: string[] = [];
  for (const allow of input.profile.secrets?.allowed ?? []) {
    const value = input.values[allow.name];
    if (value === undefined) continue;
    if (allow.hosts && allow.hosts.length > 0) {
      for (const host of allow.hosts) {
        out.push("--secret", `${allow.name}=${value}@${host}`);
      }
    } else {
      out.push("--secret", `${allow.name}=${value}`);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run tests/secrets/policy.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/secrets/policy.ts tests/secrets/policy.test.ts
git commit -m "feat(secrets): translate profile policy to msb --secret args"
```

---

## Phase 5 — Microsandbox Adapter

### Task 5.1: Add the microsandbox SDK and pick the integration mode

**Files:**
- Modify: `package.json`
- Create: `docs/spike-msb-sdk.md`

- [ ] **Step 1: Inspect what the SDK actually exposes**

Run:
```bash
npm view microsandbox 2>/dev/null || echo "package name not 'microsandbox' — check spike report"
npm info microsandbox versions --json 2>/dev/null | tail -20 || true
```

Cross-reference with the published JS SDK section of `https://docs.microsandbox.dev`. Fill in `docs/spike-msb-sdk.md`:
- Exact npm package name and version selected.
- Methods that exist for: create, start, stop, exec, rm, list.
- Methods that do NOT exist and must be done via `msb` subprocess fallback (e.g. secrets, raw flags, mounts).

- [ ] **Step 2: Add the dependency**

Run (substitute the exact name from step 1):
```bash
npm install <microsandbox-sdk-package>
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json docs/spike-msb-sdk.md
git commit -m "deps: add microsandbox sdk and document coverage gaps"
```

### Task 5.2: `msb.ts` adapter

**Files:**
- Create: `src/sandbox/msb.ts`, `tests/sandbox/msb.test.ts`

This is the only file that talks to microsandbox. Everything else uses its interface.

- [ ] **Step 1: Write the failing tests (interface + behavior, mocking the SDK and `execa`)**

`tests/sandbox/msb.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("execa", () => ({
  execa: vi.fn(),
}));

const mockSdk = {
  create: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  rm: vi.fn(),
  list: vi.fn(),
};
vi.mock("../../src/sandbox/_sdk.js", () => ({ sdk: mockSdk }));

import { msb } from "../../src/sandbox/msb.js";

describe("msb adapter", () => {
  beforeEach(() => {
    Object.values(mockSdk).forEach((fn) => fn.mockReset?.());
  });

  it("create() forwards name, image, mounts, env, secret args", async () => {
    mockSdk.create.mockResolvedValue({ id: "sb-1" });
    await msb.create({
      name: "foo-claude-nodejs",
      image: "img:t",
      mounts: [{ type: "bind", source: "/h", target: "/c" }],
      env: { A: "1" },
      secretArgs: ["--secret", "T=v"],
      raw: { cpus: 4 },
    });
    expect(mockSdk.create).toHaveBeenCalledWith(expect.objectContaining({
      name: "foo-claude-nodejs",
      image: "img:t",
    }));
  });

  it("list() returns names and statuses", async () => {
    mockSdk.list.mockResolvedValue([
      { name: "a", status: "running" },
      { name: "b", status: "stopped" },
    ]);
    const got = await msb.list();
    expect(got).toEqual([
      { name: "a", status: "running" },
      { name: "b", status: "stopped" },
    ]);
  });

  it("status() returns 'missing' when list lacks the name", async () => {
    mockSdk.list.mockResolvedValue([]);
    expect(await msb.status("ghost")).toBe("missing");
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run tests/sandbox/msb.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/sandbox/_sdk.ts` (real SDK behind a barrel that the test can stub):
```ts
// Replace this stub with the real SDK import once Task 5.1 picks the package.
// Until then, surface a clear error if anyone tries to use a method.
function notImplemented(method: string): never {
  throw new Error(`microsandbox SDK ${method}() not wired — finish task 5.1`);
}

export const sdk = {
  async create(_opts: unknown): Promise<{ id: string }> { return notImplemented("create"); },
  async start(_name: string): Promise<void> { return notImplemented("start"); },
  async stop(_name: string): Promise<void> { return notImplemented("stop"); },
  async rm(_name: string): Promise<void> { return notImplemented("rm"); },
  async list(): Promise<Array<{ name: string; status: "running" | "stopped" }>> { return notImplemented("list"); },
};
```

`src/sandbox/msb.ts`:
```ts
import { sdk } from "./_sdk.js";
import type { Mount } from "../config/types.js";

export type SandboxStatus = "running" | "stopped" | "missing";

export interface CreateInput {
  name: string;
  image: string;
  mounts: Mount[];
  env: Record<string, string>;
  secretArgs: string[];
  raw: Record<string, unknown>;
}

export interface ListItem {
  name: string;
  status: "running" | "stopped";
}

export const msb = {
  async create(input: CreateInput): Promise<{ id: string }> {
    return sdk.create(input);
  },
  async start(name: string): Promise<void> {
    return sdk.start(name);
  },
  async stop(name: string): Promise<void> {
    return sdk.stop(name);
  },
  async rm(name: string): Promise<void> {
    return sdk.rm(name);
  },
  async list(): Promise<ListItem[]> {
    return sdk.list();
  },
  async status(name: string): Promise<SandboxStatus> {
    const items = await sdk.list();
    const found = items.find((i) => i.name === name);
    if (!found) return "missing";
    return found.status;
  },
};
```

When Task 5.1 has determined the real SDK package, replace `_sdk.ts` with a thin import + adapter to that SDK. The adapter is the *only* place that knows the SDK shape; if a method must use `msb` subprocess via `execa`, do it inside `_sdk.ts` not in `msb.ts`.

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run tests/sandbox/msb.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Wire `_sdk.ts` to the real SDK**

Open `src/sandbox/_sdk.ts` and replace the stubs with calls to the SDK package selected in Task 5.1. For methods the SDK doesn't cover, use `execa("msb", [...])` and parse output. Add focused tests where parsing logic is non-trivial.

- [ ] **Step 6: Manual smoke**

Run an interactive smoke against a local `msb` install:
```bash
npx tsx -e "import('./src/sandbox/msb.js').then(m => m.msb.list()).then(console.log)"
```
Expected: an array (possibly empty). If this errors with the "not wired" message, step 5 wasn't completed.

- [ ] **Step 7: Commit**

```bash
git add src/sandbox/msb.ts src/sandbox/_sdk.ts tests/sandbox/msb.test.ts
git commit -m "feat(sandbox): msb adapter with sdk + execa fallback"
```

---

## Phase 6 — Lock + Lifecycle

### Task 6.1: Lock helper

**Files:**
- Create: `src/sandbox/lock.ts`, `tests/sandbox/lock.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/sandbox/lock.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { withSandboxLock } from "../../src/sandbox/lock.js";

describe("withSandboxLock", () => {
  let stateHome: string;

  beforeEach(async () => {
    stateHome = await fs.mkdtemp(path.join(os.tmpdir(), "komora-lk-"));
    process.env.XDG_STATE_HOME = stateHome;
  });

  afterEach(async () => {
    delete process.env.XDG_STATE_HOME;
    await fs.rm(stateHome, { recursive: true, force: true });
  });

  it("serializes concurrent withSandboxLock callers", async () => {
    const order: string[] = [];
    const slow = async (tag: string, ms: number) => {
      await withSandboxLock("foo-claude-nodejs", async () => {
        order.push(`${tag}:start`);
        await new Promise((r) => setTimeout(r, ms));
        order.push(`${tag}:end`);
      });
    };
    await Promise.all([slow("a", 60), slow("b", 10)]);
    // Whoever starts first must end before the other starts.
    expect(order).toEqual([
      "a:start", "a:end", "b:start", "b:end",
    ]);
  });

  it("releases on thrown error", async () => {
    await expect(
      withSandboxLock("name", async () => { throw new Error("boom"); })
    ).rejects.toThrow("boom");
    // Second call should not block.
    await withSandboxLock("name", async () => undefined);
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run tests/sandbox/lock.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/sandbox/lock.ts`:
```ts
import fs from "node:fs/promises";
import path from "node:path";
import lockfile from "proper-lockfile";
import { lockFile } from "../util/paths.js";

export async function withSandboxLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const lf = lockFile(name);
  await fs.mkdir(path.dirname(lf), { recursive: true });
  // Touch the file so proper-lockfile has a target.
  await fs.writeFile(lf, "", { flag: "a" });
  const release = await lockfile.lock(lf, { retries: { retries: 50, minTimeout: 20, maxTimeout: 200 } });
  try { return await fn(); } finally { await release(); }
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run tests/sandbox/lock.test.ts`
Expected: PASS (2/2). The serialization assertion is timing-sensitive; if it flakes, raise the slow-side delay rather than weakening the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/sandbox/lock.ts tests/sandbox/lock.test.ts
git commit -m "feat(sandbox): per-name file lock around lifecycle ops"
```

### Task 6.2: Lifecycle (find-or-create / start / stop / rm)

**Files:**
- Create: `src/sandbox/lifecycle.ts`, `tests/sandbox/lifecycle.test.ts`

- [ ] **Step 1: Write the failing test (mock `msb` and `secrets/store`)**

`tests/sandbox/lifecycle.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/sandbox/msb.js", () => ({
  msb: {
    create: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    rm: vi.fn(),
    status: vi.fn(),
  },
}));
vi.mock("../../src/secrets/store.js", () => ({
  getSecret: vi.fn(async () => undefined),
}));

import { msb } from "../../src/sandbox/msb.js";
import { ensureSandbox, stopSandbox, removeSandbox } from "../../src/sandbox/lifecycle.js";
import type { ResolvedConfig } from "../../src/config/types.js";

const cfg: ResolvedConfig = {
  agent: "claude",
  profile: { name: "nodejs", image: "img:t", mounts: [], env: {}, secrets: { allowed: [] } },
  raw: {},
  workspaceDir: "/tmp/foo",
  workspaceSlug: "foo",
  sandboxName: "foo-claude-nodejs",
};

describe("ensureSandbox", () => {
  beforeEach(() => {
    Object.values(msb).forEach((fn) => (fn as { mockReset?: () => void }).mockReset?.());
  });

  it("creates and starts when status is missing", async () => {
    (msb.status as ReturnType<typeof vi.fn>).mockResolvedValue("missing");
    await ensureSandbox(cfg);
    expect(msb.create).toHaveBeenCalledOnce();
    expect(msb.start).toHaveBeenCalledWith("foo-claude-nodejs");
  });

  it("starts when status is stopped", async () => {
    (msb.status as ReturnType<typeof vi.fn>).mockResolvedValue("stopped");
    await ensureSandbox(cfg);
    expect(msb.create).not.toHaveBeenCalled();
    expect(msb.start).toHaveBeenCalledWith("foo-claude-nodejs");
  });

  it("does nothing when already running", async () => {
    (msb.status as ReturnType<typeof vi.fn>).mockResolvedValue("running");
    await ensureSandbox(cfg);
    expect(msb.create).not.toHaveBeenCalled();
    expect(msb.start).not.toHaveBeenCalled();
  });
});

describe("stopSandbox", () => {
  it("calls msb.stop", async () => {
    await stopSandbox("foo-claude-nodejs");
    expect(msb.stop).toHaveBeenCalledWith("foo-claude-nodejs");
  });
});

describe("removeSandbox", () => {
  it("auto-stops a running sandbox before rm", async () => {
    (msb.status as ReturnType<typeof vi.fn>).mockResolvedValue("running");
    await removeSandbox("foo-claude-nodejs");
    expect(msb.stop).toHaveBeenCalledWith("foo-claude-nodejs");
    expect(msb.rm).toHaveBeenCalledWith("foo-claude-nodejs");
  });

  it("does not stop when status is stopped", async () => {
    (msb.status as ReturnType<typeof vi.fn>).mockResolvedValue("stopped");
    await removeSandbox("foo-claude-nodejs");
    expect(msb.stop).not.toHaveBeenCalled();
    expect(msb.rm).toHaveBeenCalledWith("foo-claude-nodejs");
  });

  it("is a no-op when missing", async () => {
    (msb.status as ReturnType<typeof vi.fn>).mockResolvedValue("missing");
    await removeSandbox("ghost");
    expect(msb.rm).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run tests/sandbox/lifecycle.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/sandbox/lifecycle.ts`:
```ts
import { msb } from "./msb.js";
import { withSandboxLock } from "./lock.js";
import { resolveSecretArgs } from "../secrets/policy.js";
import { getSecret } from "../secrets/store.js";
import type { ResolvedConfig } from "../config/types.js";

async function collectSecretValues(cfg: ResolvedConfig): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const allow of cfg.profile.secrets?.allowed ?? []) {
    const v = await getSecret(allow.name);
    if (v !== undefined) out[allow.name] = v;
  }
  return out;
}

export async function ensureSandbox(cfg: ResolvedConfig): Promise<void> {
  await withSandboxLock(cfg.sandboxName, async () => {
    const status = await msb.status(cfg.sandboxName);
    if (status === "missing") {
      const values = await collectSecretValues(cfg);
      const secretArgs = resolveSecretArgs({ profile: cfg.profile, values });
      await msb.create({
        name: cfg.sandboxName,
        image: cfg.profile.image,
        mounts: cfg.profile.mounts ?? [],
        env: cfg.profile.env ?? {},
        secretArgs,
        raw: cfg.raw,
      });
      await msb.start(cfg.sandboxName);
    } else if (status === "stopped") {
      await msb.start(cfg.sandboxName);
    }
  });
}

export async function stopSandbox(name: string): Promise<void> {
  await msb.stop(name);
}

export async function removeSandbox(name: string): Promise<void> {
  const status = await msb.status(name);
  if (status === "missing") return;
  if (status === "running") await msb.stop(name);
  await msb.rm(name);
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run tests/sandbox/lifecycle.test.ts`
Expected: PASS (8/8).

- [ ] **Step 5: Commit**

```bash
git add src/sandbox/lifecycle.ts tests/sandbox/lifecycle.test.ts
git commit -m "feat(sandbox): ensureSandbox/stop/remove lifecycle helpers"
```

### Task 6.3: Agent process exec with PTY + signal forwarding

**Files:**
- Create: `src/sandbox/agent.ts`, `tests/sandbox/agent.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/sandbox/agent.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

const events: Record<string, ((data: unknown) => void)[]> = {};
const ptyMock = {
  onData: (cb: (s: string) => void) => { (events.data ??= []).push(cb); return { dispose: () => undefined }; },
  onExit: (cb: (e: { exitCode: number; signal?: number }) => void) => { (events.exit ??= []).push(cb); return { dispose: () => undefined }; },
  resize: vi.fn(),
  kill: vi.fn(),
  write: vi.fn(),
};
vi.mock("node-pty", () => ({ spawn: vi.fn(() => ptyMock) }));

vi.mock("../../src/sandbox/msb.js", () => ({
  msb: { execCommand: vi.fn(() => ({ command: "msb", args: ["exec", "name", "claude"] })) },
}));

import { runAgent } from "../../src/sandbox/agent.js";

describe("runAgent", () => {
  it("returns the exit code from the in-sandbox process verbatim", async () => {
    const promise = runAgent({ name: "name", agent: "claude", argv: [] });
    setTimeout(() => events.exit?.[0]({ exitCode: 7 }), 0);
    await expect(promise).resolves.toBe(7);
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run tests/sandbox/agent.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Add a small helper to `msb.ts`:
```ts
// in src/sandbox/msb.ts (append)
export interface ExecCommand {
  command: string;
  args: string[];
}

export const execCommand = (sandbox: string, cmd: string, args: string[]): ExecCommand => ({
  command: "msb",
  args: ["exec", sandbox, cmd, ...args],
});
```
Re-export it from the `msb` object: `(msb as unknown as { execCommand: typeof execCommand }).execCommand = execCommand;` — or, cleaner, make `msb` a `const` literal that includes `execCommand`. Adjust the file accordingly (if you do this, also update `src/sandbox/msb.ts` to export `execCommand` on the `msb` object, and update Task 6.3's test mock to match).

`src/sandbox/agent.ts`:
```ts
import * as pty from "node-pty";
import { msb } from "./msb.js";

export interface RunAgentInput {
  name: string;
  agent: string;
  argv: string[];
}

export function runAgent(input: RunAgentInput): Promise<number> {
  const { command, args } = msb.execCommand(input.name, input.agent, input.argv);
  const cols = process.stdout.columns ?? 80;
  const rows = process.stdout.rows ?? 24;
  const child = pty.spawn(command, args, {
    name: "xterm-256color",
    cols,
    rows,
    cwd: process.cwd(),
    env: process.env as Record<string, string>,
  });

  child.onData((d) => process.stdout.write(d));
  if (process.stdin.isTTY) {
    process.stdin.setRawMode?.(true);
    process.stdin.on("data", (d) => child.write(d.toString()));
  }
  const onResize = () => child.resize(process.stdout.columns ?? cols, process.stdout.rows ?? rows);
  process.stdout.on("resize", onResize);
  const onSigint = () => child.kill("SIGINT");
  process.on("SIGINT", onSigint);

  return new Promise((resolve) => {
    child.onExit(({ exitCode }) => {
      process.stdout.off("resize", onResize);
      process.off("SIGINT", onSigint);
      if (process.stdin.isTTY) process.stdin.setRawMode?.(false);
      resolve(exitCode);
    });
  });
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run tests/sandbox/agent.test.ts`
Expected: PASS (1/1).

- [ ] **Step 5: Commit**

```bash
git add src/sandbox/agent.ts src/sandbox/msb.ts tests/sandbox/agent.test.ts
git commit -m "feat(sandbox): pty-based agent runner with signal forwarding"
```

---

## Phase 7 — CLI Commands

Each command is a thin wrapper over the helpers above. Tests verify wiring; the heavy logic is already covered.

### Task 7.1: `komora secrets {set,list,rm}`

**Files:**
- Create: `src/commands/secrets.ts`, `tests/commands/secrets.test.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Write the failing test**

`tests/commands/secrets.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
vi.mock("../../src/secrets/store.js", () => ({
  setSecret: vi.fn(),
  removeSecret: vi.fn(),
  listSecrets: vi.fn(async () => ["A", "B"]),
}));
import { setSecret, removeSecret, listSecrets } from "../../src/secrets/store.js";
import { secretsList, secretsSet, secretsRm } from "../../src/commands/secrets.js";

describe("secrets commands", () => {
  it("list prints names to stdout (one per line)", async () => {
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await secretsList();
    expect(out).toHaveBeenCalledWith("A\nB\n");
    out.mockRestore();
  });

  it("set with --from-stdin reads stdin", async () => {
    process.stdin.push("supersecret");
    process.stdin.push(null);
    await secretsSet("X", { fromStdin: true });
    expect(setSecret).toHaveBeenCalledWith("X", "supersecret");
  });

  it("rm calls store.removeSecret", async () => {
    await secretsRm("X");
    expect(removeSecret).toHaveBeenCalledWith("X");
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run tests/commands/secrets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/commands/secrets.ts`:
```ts
import { setSecret, removeSecret, listSecrets } from "../secrets/store.js";

async function readStdin(): Promise<string> {
  let buf = "";
  for await (const chunk of process.stdin) buf += chunk.toString();
  return buf;
}

async function promptNoEcho(label: string): Promise<string> {
  process.stderr.write(`${label}: `);
  process.stdin.setRawMode?.(true);
  let value = "";
  for await (const chunk of process.stdin) {
    const s = chunk.toString();
    if (s === "\n" || s === "\r") break;
    value += s;
  }
  process.stdin.setRawMode?.(false);
  process.stderr.write("\n");
  return value;
}

export async function secretsSet(name: string, opts: { fromStdin?: boolean }): Promise<void> {
  const value = opts.fromStdin ? (await readStdin()).trimEnd() : await promptNoEcho(`secret ${name}`);
  await setSecret(name, value);
}

export async function secretsList(): Promise<void> {
  const names = await listSecrets();
  if (names.length === 0) return;
  process.stdout.write(`${names.join("\n")}\n`);
}

export async function secretsRm(name: string): Promise<void> {
  await removeSecret(name);
}
```

- [ ] **Step 4: Wire into `src/cli.ts`**

Replace `src/cli.ts` body with:
```ts
#!/usr/bin/env node
import { Command } from "commander";
import { secretsSet, secretsList, secretsRm } from "./commands/secrets.js";

const program = new Command();
program.name("komora").description("Per-workspace microVM sandboxes for AI agents.").version("0.0.0");

const secrets = program.command("secrets").description("Manage the komora secret store.");
secrets.command("set <name>").option("--from-stdin", "read value from stdin").action((name, opts) => secretsSet(name, opts));
secrets.command("list").action(() => secretsList());
secrets.command("rm <name>").action((name) => secretsRm(name));

program.parseAsync(process.argv);
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `npx vitest run tests/commands/secrets.test.ts`
Expected: PASS (3/3).

- [ ] **Step 6: Manual smoke**

Run:
```bash
XDG_CONFIG_HOME=/tmp/k-smoke npx tsx src/cli.ts secrets set FOO --from-stdin <<< "bar"
XDG_CONFIG_HOME=/tmp/k-smoke npx tsx src/cli.ts secrets list
```
Expected output for the second command: `FOO`.

- [ ] **Step 7: Commit**

```bash
git add src/commands/secrets.ts src/cli.ts tests/commands/secrets.test.ts
git commit -m "feat(cli): komora secrets {set,list,rm}"
```

### Task 7.2: `komora ls`

**Files:**
- Create: `src/commands/ls.ts`, `tests/commands/ls.test.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Write the failing test**

`tests/commands/ls.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
vi.mock("../../src/sandbox/msb.js", () => ({
  msb: { list: vi.fn(async () => [
    { name: "a", status: "running" },
    { name: "b", status: "stopped" },
  ]) },
}));
import { ls } from "../../src/commands/ls.js";

describe("ls command", () => {
  it("prints a two-column listing", async () => {
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await ls();
    const calls = out.mock.calls.map((c) => c[0]).join("");
    expect(calls).toMatch(/a\s+running/);
    expect(calls).toMatch(/b\s+stopped/);
    out.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run tests/commands/ls.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/commands/ls.ts`:
```ts
import { msb } from "../sandbox/msb.js";

export async function ls(): Promise<void> {
  const items = await msb.list();
  if (items.length === 0) return;
  const width = Math.max(...items.map((i) => i.name.length));
  for (const i of items) {
    process.stdout.write(`${i.name.padEnd(width)}  ${i.status}\n`);
  }
}
```

- [ ] **Step 4: Wire into CLI**

Add to `src/cli.ts` before `program.parseAsync`:
```ts
import { ls } from "./commands/ls.js";
program.command("ls").description("List sandboxes.").action(() => ls());
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `npx vitest run tests/commands/ls.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/commands/ls.ts src/cli.ts tests/commands/ls.test.ts
git commit -m "feat(cli): komora ls"
```

### Task 7.3: `komora stop`, `komora rm`

**Files:**
- Create: `src/commands/stop.ts`, `src/commands/rm.ts`, `tests/commands/stop-rm.test.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Write the failing test**

`tests/commands/stop-rm.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
vi.mock("../../src/sandbox/lifecycle.js", () => ({
  stopSandbox: vi.fn(),
  removeSandbox: vi.fn(),
}));
import { stopSandbox, removeSandbox } from "../../src/sandbox/lifecycle.js";
import { stop } from "../../src/commands/stop.js";
import { rm } from "../../src/commands/rm.js";

describe("stop/rm commands", () => {
  it("stop calls stopSandbox", async () => {
    await stop("foo");
    expect(stopSandbox).toHaveBeenCalledWith("foo");
  });
  it("rm calls removeSandbox", async () => {
    await rm("foo");
    expect(removeSandbox).toHaveBeenCalledWith("foo");
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run tests/commands/stop-rm.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/commands/stop.ts`:
```ts
import { stopSandbox } from "../sandbox/lifecycle.js";
export async function stop(name: string): Promise<void> { await stopSandbox(name); }
```

`src/commands/rm.ts`:
```ts
import { removeSandbox } from "../sandbox/lifecycle.js";
export async function rm(name: string): Promise<void> { await removeSandbox(name); }
```

- [ ] **Step 4: Wire into CLI**

Add to `src/cli.ts`:
```ts
import { stop } from "./commands/stop.js";
import { rm } from "./commands/rm.js";
program.command("stop <name>").description("Stop a running sandbox.").action((n) => stop(n));
program.command("rm <name>").description("Remove a sandbox.").action((n) => rm(n));
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `npx vitest run tests/commands/stop-rm.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/commands/stop.ts src/commands/rm.ts src/cli.ts tests/commands/stop-rm.test.ts
git commit -m "feat(cli): komora stop and komora rm"
```

### Task 7.4: `komora exec` (strict)

**Files:**
- Create: `src/commands/exec.ts`, `tests/commands/exec.test.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Write the failing test**

`tests/commands/exec.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
vi.mock("../../src/sandbox/msb.js", () => ({
  msb: { status: vi.fn() },
}));
vi.mock("../../src/sandbox/agent.js", () => ({
  runAgent: vi.fn(async () => 0),
}));
import { msb } from "../../src/sandbox/msb.js";
import { runAgent } from "../../src/sandbox/agent.js";
import { exec } from "../../src/commands/exec.js";

describe("exec command", () => {
  it("errors when sandbox not running", async () => {
    (msb.status as ReturnType<typeof vi.fn>).mockResolvedValue("stopped");
    await expect(exec("name", "ls", [])).rejects.toThrow(/not running/i);
    expect(runAgent).not.toHaveBeenCalled();
  });
  it("runs the command when running", async () => {
    (msb.status as ReturnType<typeof vi.fn>).mockResolvedValue("running");
    const code = await exec("name", "ls", ["-la"]);
    expect(runAgent).toHaveBeenCalledWith({ name: "name", agent: "ls", argv: ["-la"] });
    expect(code).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run tests/commands/exec.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/commands/exec.ts`:
```ts
import { msb } from "../sandbox/msb.js";
import { runAgent } from "../sandbox/agent.js";

export async function exec(name: string, cmd: string, args: string[]): Promise<number> {
  const status = await msb.status(name);
  if (status !== "running") throw new Error(`sandbox '${name}' is not running (status: ${status})`);
  return runAgent({ name, agent: cmd, argv: args });
}
```

- [ ] **Step 4: Wire into CLI**

Add to `src/cli.ts`:
```ts
import { exec as execCmd } from "./commands/exec.js";
program
  .command("exec <name> <cmd> [args...]")
  .description("Run a command in a running sandbox (strict).")
  .action(async (name, cmd, args: string[] = []) => {
    process.exit(await execCmd(name, cmd, args));
  });
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `npx vitest run tests/commands/exec.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/commands/exec.ts src/cli.ts tests/commands/exec.test.ts
git commit -m "feat(cli): komora exec with strict not-running check"
```

### Task 7.5: `komora create`, `komora start`

**Files:**
- Create: `src/commands/create.ts`, `src/commands/start.ts`, `tests/commands/create-start.test.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Write the failing test**

`tests/commands/create-start.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
vi.mock("../../src/config/index.js", () => ({ loadResolvedConfig: vi.fn() }));
vi.mock("../../src/sandbox/lifecycle.js", () => ({ ensureSandbox: vi.fn() }));
vi.mock("../../src/sandbox/msb.js", () => ({ msb: { start: vi.fn() } }));

import { loadResolvedConfig } from "../../src/config/index.js";
import { ensureSandbox } from "../../src/sandbox/lifecycle.js";
import { msb } from "../../src/sandbox/msb.js";
import { create } from "../../src/commands/create.js";
import { start } from "../../src/commands/start.js";

const fakeCfg = { sandboxName: "foo-claude-nodejs" } as never;

describe("create/start commands", () => {
  it("create resolves config and ensures sandbox without running an agent", async () => {
    (loadResolvedConfig as ReturnType<typeof vi.fn>).mockResolvedValue(fakeCfg);
    await create({ agent: "claude", profile: "nodejs", workspaceDir: "/tmp/foo" });
    expect(ensureSandbox).toHaveBeenCalledWith(fakeCfg);
  });

  it("start calls msb.start by name", async () => {
    await start("foo-claude-nodejs");
    expect(msb.start).toHaveBeenCalledWith("foo-claude-nodejs");
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run tests/commands/create-start.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/commands/create.ts`:
```ts
import { loadResolvedConfig } from "../config/index.js";
import { ensureSandbox } from "../sandbox/lifecycle.js";

export interface CreateOpts {
  agent?: string;
  profile?: string;
  name?: string;
  workspaceDir: string;
}

export async function create(opts: CreateOpts): Promise<void> {
  const cfg = await loadResolvedConfig({
    workspaceDir: opts.workspaceDir,
    agentOverride: opts.agent,
    profileOverride: opts.profile,
    nameOverride: opts.name,
  });
  await ensureSandbox(cfg);
}
```

`src/commands/start.ts`:
```ts
import { msb } from "../sandbox/msb.js";
export async function start(name: string): Promise<void> { await msb.start(name); }
```

- [ ] **Step 4: Wire into CLI**

```ts
import { create } from "./commands/create.js";
import { start } from "./commands/start.js";
program
  .command("create [agent]")
  .option("--profile <name>")
  .option("--name <override>")
  .description("Create a sandbox without running an agent.")
  .action((agent, opts) => create({ agent, profile: opts.profile, name: opts.name, workspaceDir: process.cwd() }));
program.command("start <name>").description("Start a stopped sandbox.").action((n) => start(n));
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `npx vitest run tests/commands/create-start.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/commands/create.ts src/commands/start.ts src/cli.ts tests/commands/create-start.test.ts
git commit -m "feat(cli): komora create and komora start"
```

### Task 7.6: `komora run` (find-or-create + spawn agent)

**Files:**
- Create: `src/commands/run.ts`, `tests/commands/run.test.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Write the failing test**

`tests/commands/run.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
vi.mock("../../src/config/index.js", () => ({ loadResolvedConfig: vi.fn() }));
vi.mock("../../src/sandbox/lifecycle.js", () => ({ ensureSandbox: vi.fn() }));
vi.mock("../../src/sandbox/agent.js", () => ({ runAgent: vi.fn(async () => 42) }));

import { loadResolvedConfig } from "../../src/config/index.js";
import { ensureSandbox } from "../../src/sandbox/lifecycle.js";
import { runAgent } from "../../src/sandbox/agent.js";
import { run } from "../../src/commands/run.js";

describe("run command", () => {
  it("ensures sandbox then runs agent and returns its exit code", async () => {
    (loadResolvedConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      agent: "claude", sandboxName: "foo-claude-nodejs",
    });
    const code = await run({ agent: "claude", argv: ["--help"], workspaceDir: "/tmp/foo" });
    expect(ensureSandbox).toHaveBeenCalled();
    expect(runAgent).toHaveBeenCalledWith({ name: "foo-claude-nodejs", agent: "claude", argv: ["--help"] });
    expect(code).toBe(42);
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run tests/commands/run.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/commands/run.ts`:
```ts
import { loadResolvedConfig } from "../config/index.js";
import { ensureSandbox } from "../sandbox/lifecycle.js";
import { runAgent } from "../sandbox/agent.js";

export interface RunOpts {
  agent?: string;
  profile?: string;
  name?: string;
  argv: string[];
  workspaceDir: string;
}

export async function run(opts: RunOpts): Promise<number> {
  const cfg = await loadResolvedConfig({
    workspaceDir: opts.workspaceDir,
    agentOverride: opts.agent,
    profileOverride: opts.profile,
    nameOverride: opts.name,
  });
  await ensureSandbox(cfg);
  return runAgent({ name: cfg.sandboxName, agent: cfg.agent, argv: opts.argv });
}
```

- [ ] **Step 4: Wire into CLI**

```ts
import { run } from "./commands/run.js";
program
  .command("run [agent]")
  .option("--profile <name>")
  .option("--name <override>")
  .allowUnknownOption(true)
  .description("Find-or-create the sandbox and run the agent (everything after `--` is forwarded).")
  .action(async (agent, opts, command) => {
    const argv = command.args.slice(1); // arguments after [agent]
    process.exit(await run({ agent, profile: opts.profile, name: opts.name, argv, workspaceDir: process.cwd() }));
  });
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `npx vitest run tests/commands/run.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/commands/run.ts src/cli.ts tests/commands/run.test.ts
git commit -m "feat(cli): komora run with reuse-by-name"
```

### Task 7.7: `komora logs`

**Files:**
- Create: `src/commands/logs.ts`, `tests/commands/logs.test.ts`
- Modify: `src/cli.ts`

The spec frames logs as "a thin tail of the agent process's stderr." Microsandbox should expose this somehow (SDK or `msb logs`); discover during Task 5.1 and connect here.

- [ ] **Step 1: Write the failing test (mock the SDK call)**

`tests/commands/logs.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/sandbox/_sdk.js", () => ({
  sdk: {
    logs: vi.fn((_n: string, onLine: (l: string) => void) => {
      onLine("line one");
      onLine("line two");
      return Promise.resolve();
    }),
  },
}));

import { logs } from "../../src/commands/logs.js";

describe("logs command", () => {
  it("forwards each line to stderr", async () => {
    const w = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await logs("foo");
    expect(w).toHaveBeenCalledWith("line one\n");
    expect(w).toHaveBeenCalledWith("line two\n");
    w.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run tests/commands/logs.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add `logs` to the SDK barrel**

In `src/sandbox/_sdk.ts`, add:
```ts
async logs(_name: string, _onLine: (line: string) => void): Promise<void> { return notImplemented("logs"); },
```
and wire it to the real SDK / `msb logs --follow` subprocess as part of the work in Task 5.1's follow-up.

- [ ] **Step 4: Implement**

`src/commands/logs.ts`:
```ts
import { sdk } from "../sandbox/_sdk.js";
export async function logs(name: string): Promise<void> {
  await sdk.logs(name, (line) => process.stderr.write(`${line}\n`));
}
```

- [ ] **Step 5: Wire into CLI**

```ts
import { logs } from "./commands/logs.js";
program.command("logs <name>").description("Stream the agent's stderr.").action((n) => logs(n));
```

- [ ] **Step 6: Run tests, confirm pass**

Run: `npx vitest run tests/commands/logs.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/commands/logs.ts src/sandbox/_sdk.ts src/cli.ts tests/commands/logs.test.ts
git commit -m "feat(cli): komora logs streams stderr"
```

### Task 7.8: `komora config show`

**Files:**
- Create: `src/commands/config-show.ts`, `tests/commands/config-show.test.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Write the failing test**

`tests/commands/config-show.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/config/index.js", () => ({
  loadResolvedConfig: vi.fn(async () => ({
    agent: "claude",
    profile: { name: "n", image: "i:t" },
    raw: {},
    workspaceDir: "/tmp/foo",
    workspaceSlug: "foo",
    sandboxName: "foo-claude-n",
  })),
}));

import { configShow } from "../../src/commands/config-show.js";

describe("config show", () => {
  it("prints YAML by default", async () => {
    const w = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await configShow({ agent: "claude", workspaceDir: "/tmp/foo", json: false });
    const out = w.mock.calls.map((c) => c[0]).join("");
    expect(out).toMatch(/^agent: claude/m);
    w.mockRestore();
  });

  it("prints JSON with --json", async () => {
    const w = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await configShow({ agent: "claude", workspaceDir: "/tmp/foo", json: true });
    const out = w.mock.calls.map((c) => c[0]).join("");
    expect(JSON.parse(out).agent).toBe("claude");
    w.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run tests/commands/config-show.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/commands/config-show.ts`:
```ts
import yaml from "js-yaml";
import { loadResolvedConfig } from "../config/index.js";

export interface ShowOpts {
  agent: string;
  profile?: string;
  workspaceDir: string;
  json: boolean;
}

export async function configShow(opts: ShowOpts): Promise<void> {
  const cfg = await loadResolvedConfig({
    workspaceDir: opts.workspaceDir,
    agentOverride: opts.agent,
    profileOverride: opts.profile,
  });
  if (opts.json) process.stdout.write(`${JSON.stringify(cfg, null, 2)}\n`);
  else process.stdout.write(yaml.dump(cfg));
}
```

- [ ] **Step 4: Wire into CLI**

```ts
import { configShow } from "./commands/config-show.js";
program
  .command("config")
  .description("Config inspection.")
  .command("show <agent>")
  .option("--profile <name>")
  .option("--json")
  .action((agent, opts) => configShow({ agent, profile: opts.profile, workspaceDir: process.cwd(), json: !!opts.json }));
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `npx vitest run tests/commands/config-show.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/commands/config-show.ts src/cli.ts tests/commands/config-show.test.ts
git commit -m "feat(cli): komora config show (yaml/json)"
```

---

## Phase 8 — Built-in Profiles

Per the DinD spike outcome: ship `nodejs` and `python` *without* DinD if it doesn't work. `kotlin-android` is added if and only if the Android-tools image fits a microsandbox VM (verify before adding).

### Task 8.1: `nodejs` built-in profile

**Files:**
- Create: `src/profiles/builtin/nodejs.yaml`, `tests/profiles/builtin.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/profiles/builtin.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseProfile } from "../../src/config/load.js";

const builtinDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "profiles", "builtin");

describe("built-in profiles", () => {
  it("nodejs is valid against the schema", async () => {
    const yaml = await fs.readFile(path.join(builtinDir, "nodejs.yaml"), "utf8");
    const p = parseProfile(yaml);
    expect(p.name).toBe("nodejs");
    expect(p.image).toContain("node");
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run tests/profiles/builtin.test.ts`
Expected: FAIL — file missing.

- [ ] **Step 3: Implement**

`src/profiles/builtin/nodejs.yaml`:
```yaml
name: nodejs
image: node:20-bookworm
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
    - name: GITHUB_TOKEN
      hosts: ["github.com", "api.github.com"]
      requireTls: true
    - name: NPM_TOKEN
      hosts: ["registry.npmjs.org"]
      requireTls: true
startup:
  - npm config set registry https://registry.npmjs.org
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run tests/profiles/builtin.test.ts`
Expected: PASS (1/1).

- [ ] **Step 5: Commit**

```bash
git add src/profiles/builtin/nodejs.yaml tests/profiles/builtin.test.ts
git commit -m "feat(profiles): built-in nodejs profile"
```

### Task 8.2: `python` built-in profile

**Files:**
- Create: `src/profiles/builtin/python.yaml`
- Modify: `tests/profiles/builtin.test.ts`

- [ ] **Step 1: Add the failing assertion**

Append to `tests/profiles/builtin.test.ts`:
```ts
import path2 from "node:path";
import fs2 from "node:fs/promises";
import { describe as describe2, it as it2, expect as expect2 } from "vitest";

describe2("python builtin", () => {
  it2("is valid", async () => {
    const yaml = await fs2.readFile(path2.join(builtinDir, "python.yaml"), "utf8");
    const p = parseProfile(yaml);
    expect2(p.name).toBe("python");
    expect2(p.image).toContain("python");
  });
});
```

(If you prefer, fold the assertion into the existing `describe` block — same test count, same coverage.)

- [ ] **Step 2: Run tests, confirm fail**

Run: `npx vitest run tests/profiles/builtin.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/profiles/builtin/python.yaml`:
```yaml
name: python
image: python:3.12-bookworm
env:
  PIP_DISABLE_PIP_VERSION_CHECK: "1"
mounts:
  - type: bind
    source: ${WORKSPACE}
    target: /workspace
  - type: volume
    name: python-cache
    target: /root/.cache/pip
secrets:
  allowed:
    - name: GITHUB_TOKEN
      hosts: ["github.com", "api.github.com"]
      requireTls: true
    - name: PYPI_TOKEN
      hosts: ["upload.pypi.org", "pypi.org"]
      requireTls: true
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run tests/profiles/builtin.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/profiles/builtin/python.yaml tests/profiles/builtin.test.ts
git commit -m "feat(profiles): built-in python profile"
```

### Task 8.3: `kotlin-android` built-in profile (conditional)

**Files:**
- Create (only if feasible): `src/profiles/builtin/kotlin-android.yaml`

- [ ] **Step 1: Decide based on the DinD spike & SDK image size**

Open `docs/spike-dind-feasibility.md`. If the Android SDK image (~10GB) is too large for the typical microsandbox VM and the user's bandwidth, **skip this task** and note the skip in the spike report. Otherwise proceed.

- [ ] **Step 2 (if proceeding): Implement**

`src/profiles/builtin/kotlin-android.yaml`:
```yaml
name: kotlin-android
image: gradle:8-jdk21
env:
  GRADLE_USER_HOME: /root/.gradle
mounts:
  - type: bind
    source: ${WORKSPACE}
    target: /workspace
  - type: volume
    name: gradle-cache
    target: /root/.gradle
  - type: volume
    name: android-sdk
    target: /opt/android-sdk
secrets:
  allowed:
    - name: GITHUB_TOKEN
      hosts: ["github.com", "api.github.com"]
      requireTls: true
startup:
  - echo "Note: Android SDK install is left to per-project setup."
```

- [ ] **Step 3: Add the schema assertion**

Same pattern as Task 8.2 — load and validate.

- [ ] **Step 4: Commit**

```bash
git add src/profiles/builtin/kotlin-android.yaml tests/profiles/builtin.test.ts
git commit -m "feat(profiles): built-in kotlin-android profile"
```

If skipped, commit instead an updated `docs/spike-dind-feasibility.md`:
```bash
git add docs/spike-dind-feasibility.md
git commit -m "docs: defer kotlin-android built-in profile to post-V1"
```

---

## Phase 9 — End-to-End Integration

These tests require a real `msb` install. They run only when `KOMORA_E2E=1`.

### Task 9.1: End-to-end `run` smoke

**Files:**
- Create: `tests/integration/run.e2e.test.ts`

- [ ] **Step 1: Write the test**

`tests/integration/run.e2e.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { execa } from "execa";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

const e2e = process.env.KOMORA_E2E === "1";
const itE2E = e2e ? it : it.skip;

describe("e2e: komora run", () => {
  itE2E("creates, runs `echo hi`, and exits with the agent's exit code", async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), "komora-e2e-"));
    await fs.writeFile(path.join(work, "komora.config.yaml"), "agent: sh\nprofile: nodejs\n");

    const r = await execa("npx", ["tsx", path.resolve("src/cli.ts"), "run", "sh", "--", "-c", "echo hi"], {
      cwd: work, reject: false,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("hi");

    await execa("npx", ["tsx", path.resolve("src/cli.ts"), "rm", `${path.basename(work)}-sh-nodejs`], {
      cwd: work, reject: false,
    });
    await fs.rm(work, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run with E2E off, confirm skipped**

Run: `npx vitest run tests/integration/run.e2e.test.ts`
Expected: 1 skipped, 0 failed.

- [ ] **Step 3: Run with E2E on, confirm pass**

Run: `KOMORA_E2E=1 npx vitest run tests/integration/run.e2e.test.ts`
Expected: PASS. If it fails, the failure is real — debug. **Do not** weaken the assertions.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/run.e2e.test.ts
git commit -m "test(e2e): smoke test for komora run end-to-end"
```

---

## Phase 10 — README & Release Wiring

### Task 10.1: README with usage and schema header doc

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace `README.md`**

```md
# komora

Per-workspace microVM sandboxes for AI coding agents — `claude`, `opencode`, anything else with a CLI.

## Quick start

\`\`\`bash
# from the root of any project
echo 'agent: claude
profile: nodejs' > komora.config.yaml

komora secrets set GITHUB_TOKEN
komora run claude
\`\`\`

## Editor IntelliSense

Add this header to `komora.config.yaml`:

\`\`\`yaml
# yaml-language-server: $schema=https://komora.dev/schema/v1.json
\`\`\`

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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for v1 ux"
```

### Task 10.2: Build pipeline check + version bump prep

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Run a clean build**

```bash
rm -rf dist node_modules
npm install
npm run typecheck
npm test
npm run build
node dist/cli.js --version
```
Expected: every step passes; the binary prints `0.0.0`.

- [ ] **Step 2: Bump version to `0.1.0`**

Edit `package.json`: `"version": "0.1.0"`.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: bump to 0.1.0 for v1"
```

---

## Self-Review

**Spec coverage check (running through the spec sections):**

- *Reuse-by-name lifecycle* → Tasks 6.2 (`ensureSandbox`), 7.6 (`run`).
- *Profiles + built-ins* → Phase 3 (load/discover/resolve), Phase 8 (built-ins).
- *Komora-owned secret store* → Phase 4, Task 7.1.
- *Native shell composition (exit codes, PTY, signals)* → Task 6.3, Task 7.4 (passes through).
- *YAML config + JSON Schema validation* → Tasks 3.2, 3.4.
- *No built-in MCP-projection primitive* → Phase 0 (DinD spike) ensures we don't ship built-ins that depend on it.
- *No image versioning / digest* → `digest` reserved & warned in Task 3.5.
- *Layered profile discovery* → Task 3.3.
- *`raw:` escape hatch + conflict-error* → Task 3.5.
- *Stderr-only logging* → Task 2.4 + every command writes to stdout/stderr appropriately.
- *Sandbox naming `<workspace-slug>-<agent>-<profile>` + `--name`* → Task 2.2.
- *`flock`-style lock keyed on workspace slug* → Task 6.1. (Note: lock keyed on the full `sandboxName`, which subsumes workspace slug + agent + profile, matching the spec's "workspace slug" intent for the same-slug-same-agent-same-profile path.)
- *All commands listed in the spec table* → Tasks 7.1–7.8.

**Placeholder scan:** No "TODO", "TBD", "implement later", or hand-wavy "add validation" steps. Every code step has a code block. Every command step has the exact command and expected output.

**Type consistency:** `ResolvedConfig`, `Profile`, `RepoConfig`, `Mount`, `SecretAllowance` defined in Task 3.1 and consumed verbatim in 3.4, 3.5, 3.6, 4.2, 6.2, 6.3, and 7.x. `sandboxName(...)` signature is fixed in Task 2.2 and reused in 3.5. `msb` adapter surface (Task 5.2) is reused by 6.2, 6.3, 7.2, 7.4, 7.5.

**Two known follow-ups inside the plan that the executor must finish, not skip:**
1. Task 5.2 step 5: wire `_sdk.ts` to the real microsandbox SDK based on Task 5.1's findings. The plan flags this; do not declare V1 done until it's wired.
2. Task 7.7 step 3: `sdk.logs(...)` must connect to a real log stream (SDK or `msb logs --follow`). Same condition.
