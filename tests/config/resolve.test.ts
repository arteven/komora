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

  it("exposes opted-in subset on ResolvedConfig.secretsAllow", () => {
    const r = resolveConfig({
      profile: baseProfile,
      repoConfig: { agent: "claude", profile: "nodejs", secrets: { allow: ["GITHUB_TOKEN"] } },
      workspaceDir: "/tmp/foo",
      workspaceSlug: "foo",
    });
    expect(r.secretsAllow).toEqual(["GITHUB_TOKEN"]);
  });

  it("secretsAllow defaults to empty array when repo opts in to nothing", () => {
    const r = resolveConfig({
      profile: baseProfile,
      repoConfig: { agent: "claude", profile: "nodejs" },
      workspaceDir: "/tmp/foo",
      workspaceSlug: "foo",
    });
    expect(r.secretsAllow).toEqual([]);
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
