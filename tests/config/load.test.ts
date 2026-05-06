import { describe, it, expect } from "vitest";
import { parseRepoConfig } from "../../src/config/load.js";

describe("parseRepoConfig v2", () => {
  it("parses minimal YAML", () => {
    const cfg = parseRepoConfig("{}");
    expect(cfg).toEqual({});
  });

  it("parses full config", () => {
    const yaml = `
toolchain:
  - node: "22"
setup:
  - npm ci
env:
  NODE_ENV: development
secrets:
  - GITHUB_TOKEN
network:
  allowedDomains:
    - github.com
  serviceDomains:
    api.github.com: GITHUB_TOKEN
`;
    const cfg = parseRepoConfig(yaml);
    expect(cfg.toolchain).toEqual([{ node: "22" }]);
    expect(cfg.setup).toEqual(["npm ci"]);
    expect(cfg.env).toEqual({ NODE_ENV: "development" });
    expect(cfg.secrets).toEqual(["GITHUB_TOKEN"]);
    expect(cfg.network!.allowedDomains).toEqual(["github.com"]);
    expect(cfg.network!.serviceDomains).toEqual({ "api.github.com": "GITHUB_TOKEN" });
  });

  it("throws on invalid YAML", () => {
    expect(() => parseRepoConfig("secrets: not-a-list")).toThrow();
  });

  it("throws on v1-style config with agent field", () => {
    expect(() => parseRepoConfig("agent: claude\nprofile: nodejs")).toThrow();
  });
});
