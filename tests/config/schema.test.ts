import { describe, it, expect } from "vitest";
import { validateRepoConfig } from "../../src/config/schema.js";

describe("v2 repo config schema", () => {
  it("accepts empty config", () => {
    expect(() => validateRepoConfig({})).not.toThrow();
  });

  it("accepts full config", () => {
    expect(() =>
      validateRepoConfig({
        toolchain: [{ node: "22" }, { rust: "stable" }],
        setup: ["npm install -g typescript"],
        env: { NODE_ENV: "development" },
        mounts: [{ type: "bind", source: "./data", target: "/workspace/data" }],
        secrets: ["GITHUB_TOKEN", "NPM_TOKEN"],
        network: {
          allowedDomains: ["github.com"],
          serviceDomains: { "api.github.com": "GITHUB_TOKEN" },
        },
        raw: { cpus: 4, memory: 4096 },
      })
    ).not.toThrow();
  });

  it("rejects toolchain entry with multiple keys", () => {
    expect(() =>
      validateRepoConfig({ toolchain: [{ node: "22", bun: "1" }] })
    ).toThrow();
  });

  it("rejects non-string toolchain version", () => {
    expect(() =>
      validateRepoConfig({ toolchain: [{ node: 22 }] })
    ).toThrow();
  });

  it("rejects non-string secret name", () => {
    expect(() =>
      validateRepoConfig({ secrets: [123] })
    ).toThrow();
  });

  it("rejects unknown top-level field", () => {
    expect(() =>
      validateRepoConfig({ agent: "claude" })
    ).toThrow();
  });

  it("rejects mount without target", () => {
    expect(() =>
      validateRepoConfig({ mounts: [{ type: "bind", source: "./foo" }] })
    ).toThrow();
  });

  it("accepts config with only toolchain", () => {
    expect(() => validateRepoConfig({ toolchain: [{ python: "3.12" }] })).not.toThrow();
  });

  it("accepts config with only secrets", () => {
    expect(() => validateRepoConfig({ secrets: ["MY_TOKEN"] })).not.toThrow();
  });

  it("accepts network with only serviceDomains", () => {
    expect(() =>
      validateRepoConfig({
        network: { serviceDomains: { "api.example.com": "TOKEN" } },
      })
    ).not.toThrow();
  });

  it("accepts network with empty allowedDomains", () => {
    expect(() =>
      validateRepoConfig({ network: { allowedDomains: [] } })
    ).not.toThrow();
  });
});
