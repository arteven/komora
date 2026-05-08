import { describe, it, expect } from "vitest";
import type { AgentDefinition, Mount, RepoConfig, ResolvedConfig } from "../../src/config/types.js";

describe("v2 types", () => {
  it("AgentDefinition has required fields", () => {
    const agent: AgentDefinition = {
      template: "docker/sandbox-templates:claude-code-docker",
      command: "claude",
      authVolumes: [{ type: "volume", name: "claude-auth", target: "/home/agent/.claude" }],
      defaultSecrets: ["ANTHROPIC_API_KEY"],
      defaultDomains: ["api.anthropic.com"],
    };
    expect(agent.template).toBe("docker/sandbox-templates:claude-code-docker");
    expect(agent.command).toBe("claude");
    expect(agent.authVolumes).toHaveLength(1);
    expect(agent.defaultSecrets).toContain("ANTHROPIC_API_KEY");
    expect(agent.defaultDomains).toContain("api.anthropic.com");
  });

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

  it("ResolvedConfig merges agent + repo", () => {
    const resolved: ResolvedConfig = {
      agent: "claude",
      agentDef: {
        template: "docker/sandbox-templates:claude-code-docker",
        command: "claude",
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
});
