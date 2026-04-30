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
