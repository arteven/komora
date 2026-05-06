import { describe, it, expect } from "vitest";
import { resolveConfig } from "../../src/config/resolve.js";
import type { AgentDefinition, RepoConfig } from "../../src/config/types.js";

const claude: AgentDefinition = {
  template: "docker/sandbox-templates:claude-code-docker",
  command: "claude",
  authVolumes: [{ type: "volume", name: "claude-auth", target: "/home/agent/.claude" }],
  defaultSecrets: ["ANTHROPIC_API_KEY"],
  defaultDomains: ["api.anthropic.com", "auth.anthropic.com"],
};

const emptyRepo: RepoConfig = {};

describe("resolveConfig v2", () => {
  it("resolves with agent defaults only (no repo config)", () => {
    const resolved = resolveConfig({
      agent: "claude",
      agentDef: claude,
      repoConfig: emptyRepo,
      workspaceDir: "/home/user/project",
      workspaceSlug: "project",
    });
    expect(resolved.image).toBe("docker/sandbox-templates:claude-code-docker");
    expect(resolved.command).toBe("claude");
    expect(resolved.mounts).toEqual([
      { type: "bind", source: "/home/user/project", target: "/workspace" },
      { type: "volume", name: "claude-auth", target: "/home/agent/.claude" },
    ]);
    expect(resolved.secrets).toEqual(["ANTHROPIC_API_KEY"]);
    expect(resolved.domains).toEqual(["api.anthropic.com", "auth.anthropic.com"]);
    expect(resolved.sandboxName).toBe("project-claude");
    expect(resolved.bare).toBe(false);
  });

  it("merges repo config on top of agent defaults", () => {
    const repo: RepoConfig = {
      env: { NODE_ENV: "dev" },
      secrets: ["GITHUB_TOKEN"],
      network: {
        allowedDomains: ["github.com"],
        serviceDomains: { "api.github.com": "GITHUB_TOKEN" },
      },
      mounts: [{ type: "bind", source: "./data", target: "/workspace/data" }],
    };
    const resolved = resolveConfig({
      agent: "claude",
      agentDef: claude,
      repoConfig: repo,
      workspaceDir: "/home/user/project",
      workspaceSlug: "project",
    });
    expect(resolved.env).toEqual({ NODE_ENV: "dev" });
    expect(resolved.secrets).toEqual(["ANTHROPIC_API_KEY", "GITHUB_TOKEN"]);
    expect(resolved.domains).toContain("api.anthropic.com");
    expect(resolved.domains).toContain("github.com");
    expect(resolved.domains).toContain("api.github.com");
    expect(resolved.mounts).toHaveLength(3);
  });

  it("--bare strips agent defaults", () => {
    const resolved = resolveConfig({
      agent: "claude",
      agentDef: claude,
      repoConfig: emptyRepo,
      workspaceDir: "/home/user/project",
      workspaceSlug: "project",
      bare: true,
    });
    expect(resolved.bare).toBe(true);
    expect(resolved.mounts).toEqual([
      { type: "bind", source: "/home/user/project", target: "/workspace" },
    ]);
    expect(resolved.secrets).toEqual([]);
    expect(resolved.domains).toEqual([]);
  });

  it("--bare with repo config keeps repo additions", () => {
    const repo: RepoConfig = {
      secrets: ["MY_TOKEN"],
      network: { allowedDomains: ["example.com"] },
    };
    const resolved = resolveConfig({
      agent: "claude",
      agentDef: claude,
      repoConfig: repo,
      workspaceDir: "/home/user/project",
      workspaceSlug: "project",
      bare: true,
    });
    expect(resolved.secrets).toEqual(["MY_TOKEN"]);
    expect(resolved.domains).toEqual(["example.com"]);
  });

  it("deduplicates secrets from serviceDomains", () => {
    const repo: RepoConfig = {
      secrets: ["GITHUB_TOKEN"],
      network: { serviceDomains: { "api.github.com": "GITHUB_TOKEN" } },
    };
    const resolved = resolveConfig({
      agent: "claude",
      agentDef: claude,
      repoConfig: repo,
      workspaceDir: "/home/user/project",
      workspaceSlug: "project",
    });
    const tokenCount = resolved.secrets.filter((s) => s === "GITHUB_TOKEN").length;
    expect(tokenCount).toBe(1);
  });

  it("serviceDomains keys added to domains", () => {
    const repo: RepoConfig = {
      network: { serviceDomains: { "api.github.com": "GITHUB_TOKEN" } },
    };
    const resolved = resolveConfig({
      agent: "claude",
      agentDef: claude,
      repoConfig: repo,
      workspaceDir: "/home/user/project",
      workspaceSlug: "project",
    });
    expect(resolved.domains).toContain("api.github.com");
  });

  it("resolves ${WORKSPACE} in mount sources", () => {
    const repo: RepoConfig = {
      mounts: [{ type: "bind", source: "${WORKSPACE}/data", target: "/data" }],
    };
    const resolved = resolveConfig({
      agent: "claude",
      agentDef: claude,
      repoConfig: repo,
      workspaceDir: "/home/user/project",
      workspaceSlug: "project",
    });
    const dataMnt = resolved.mounts.find((m) => m.target === "/data");
    expect(dataMnt!.source).toBe("/home/user/project/data");
  });

  it("resolves relative mount sources against workspaceDir", () => {
    const repo: RepoConfig = {
      mounts: [{ type: "bind", source: "./data", target: "/data" }],
    };
    const resolved = resolveConfig({
      agent: "claude",
      agentDef: claude,
      repoConfig: repo,
      workspaceDir: "/home/user/project",
      workspaceSlug: "project",
    });
    const dataMnt = resolved.mounts.find((m) => m.target === "/data");
    expect(dataMnt!.source).toBe("/home/user/project/data");
  });

  it("uses name override for sandbox name", () => {
    const resolved = resolveConfig({
      agent: "claude",
      agentDef: claude,
      repoConfig: emptyRepo,
      workspaceDir: "/home/user/project",
      workspaceSlug: "project",
      nameOverride: "custom",
    });
    expect(resolved.sandboxName).toBe("custom");
  });

  it("errors on raw key conflicting with modeled field", () => {
    expect(() =>
      resolveConfig({
        agent: "claude",
        agentDef: claude,
        repoConfig: { raw: { env: { X: "Y" } } },
        workspaceDir: "/tmp",
        workspaceSlug: "tmp",
      })
    ).toThrow(/raw\.env.*conflicts/);
  });

  it("passes toolchain and setup through", () => {
    const repo: RepoConfig = {
      toolchain: [{ node: "22" }],
      setup: ["npm ci"],
    };
    const resolved = resolveConfig({
      agent: "claude",
      agentDef: claude,
      repoConfig: repo,
      workspaceDir: "/tmp",
      workspaceSlug: "tmp",
    });
    expect(resolved.toolchain).toEqual([{ node: "22" }]);
    expect(resolved.setup).toEqual(["npm ci"]);
  });
});
