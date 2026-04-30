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
    const builtinDir = path.join(workdir, "_builtin");
    await fs.mkdir(builtinDir, { recursive: true });
    await fs.writeFile(path.join(builtinDir, "__builtin_test__.yaml"), "from: builtin\n");

    const found = await findProfile("__builtin_test__", {
      workspaceDir: workdir,
      builtinDir,
    });
    expect(found.source).toBe("builtin");
  });

  it("throws when no profile is found", async () => {
    await expect(findProfile("ghost", { workspaceDir: workdir })).rejects.toThrow(/profile.*not found/i);
  });
});
