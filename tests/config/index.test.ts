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
