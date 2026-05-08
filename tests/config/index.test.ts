import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadResolvedConfig } from "../../src/config/index.js";

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

vi.mock("node:fs/promises");

describe("loadResolvedConfig v2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads with no komora.config.yaml (zero-config)", async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

    const cfg = await loadResolvedConfig({
      workspaceDir: "/home/user/project",
      agent: "claude",
    });
    expect(cfg.agent).toBe("claude");
    expect(cfg.image).toBe("docker/sandbox-templates:claude-code-docker");
    expect(cfg.sandboxName).toBe("project-claude");
    expect(cfg.profile).toBeUndefined();
  });

  it("loads with komora.config.yaml", async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.readFile).mockResolvedValue(`
toolchain:
  - node: "22"
secrets:
  - GITHUB_TOKEN
`);

    const cfg = await loadResolvedConfig({
      workspaceDir: "/home/user/project",
      agent: "claude",
    });
    expect(cfg.toolchain).toEqual([{ node: "22" }]);
    expect(cfg.secrets).toContain("GITHUB_TOKEN");
    expect(cfg.secrets).toContain("ANTHROPIC_API_KEY");
  });

  it("requires agent argument", async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

    await expect(
      loadResolvedConfig({ workspaceDir: "/tmp" })
    ).rejects.toThrow(/agent.*required/i);
  });

  it("passes --bare flag through", async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

    const cfg = await loadResolvedConfig({
      workspaceDir: "/home/user/project",
      agent: "claude",
      bare: true,
    });
    expect(cfg.bare).toBe(true);
    expect(cfg.secrets).toEqual([]);
  });

  it("passes --name override through", async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

    const cfg = await loadResolvedConfig({
      workspaceDir: "/home/user/project",
      agent: "claude",
      nameOverride: "my-sandbox",
    });
    expect(cfg.sandboxName).toBe("my-sandbox");
  });

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
});
