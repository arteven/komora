import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAgent, BUILTIN_AGENTS } from "../../src/agents/registry.js";

vi.mock("node:fs/promises");

describe("agent registry", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns claude built-in agent", async () => {
    const agent = await getAgent("claude");
    expect(agent.template).toBe("docker/sandbox-templates:claude-code-docker");
    expect(agent.command).toBe("claude");
    expect(agent.authVolumes).toEqual([
      { type: "volume", name: "claude-auth", target: "/home/agent/.claude" },
    ]);
    expect(agent.defaultSecrets).toContain("ANTHROPIC_API_KEY");
    expect(agent.defaultDomains).toContain("api.anthropic.com");
  });

  it("returns opencode built-in agent", async () => {
    const agent = await getAgent("opencode");
    expect(agent.template).toBe("docker/sandbox-templates:opencode-docker");
    expect(agent.command).toBe("opencode");
  });

  it("returns codex built-in agent", async () => {
    const agent = await getAgent("codex");
    expect(agent.template).toBe("docker/sandbox-templates:codex-docker");
    expect(agent.command).toBe("codex");
  });

  it("returns gemini built-in agent", async () => {
    const agent = await getAgent("gemini");
    expect(agent.template).toBe("docker/sandbox-templates:gemini-docker");
    expect(agent.command).toBe("gemini");
  });

  it("returns copilot built-in agent", async () => {
    const agent = await getAgent("copilot");
    expect(agent.template).toBe("docker/sandbox-templates:copilot-docker");
    expect(agent.command).toBe("copilot");
  });

  it("returns shell built-in agent", async () => {
    const agent = await getAgent("shell");
    expect(agent.template).toBe("docker/sandbox-templates:shell-docker");
    expect(agent.command).toBe("bash");
    expect(agent.authVolumes).toEqual([]);
    expect(agent.defaultSecrets).toEqual([]);
    expect(agent.defaultDomains).toEqual([]);
  });

  it("throws for unknown agent with no user definition", async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    await expect(getAgent("nonexistent")).rejects.toThrow(/unknown agent.*nonexistent/i);
  });

  it("user-defined agent overrides built-in", async () => {
    const fs = await import("node:fs/promises");
    const userYaml = `
name: claude
template: custom/image:latest
command: my-claude
authVolumes:
  - name: my-auth
    target: /home/agent/.my-claude
defaultSecrets:
  - MY_KEY
defaultDomains:
  - my.api.com
`;
    vi.mocked(fs.readFile).mockResolvedValue(userYaml);
    const agent = await getAgent("claude");
    expect(agent.template).toBe("custom/image:latest");
    expect(agent.command).toBe("my-claude");
  });

  it("BUILTIN_AGENTS contains all 6 agents", () => {
    expect(Object.keys(BUILTIN_AGENTS).sort()).toEqual(
      ["claude", "codex", "copilot", "gemini", "opencode", "shell"]
    );
  });
});
