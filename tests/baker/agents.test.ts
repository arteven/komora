import { describe, it, expect } from "vitest";
import { agentScript } from "../../src/baker/agents.js";

describe("agentScript", () => {
  it("returns install command for a known agent", () => {
    expect(agentScript("claude")).toMatch(/agent-claude.sh/);
    expect(agentScript("opencode")).toMatch(/agent-opencode.sh/);
  });

  it("throws on unknown agent", () => {
    expect(() => agentScript("ghost")).toThrow(/unknown agent: ghost/);
  });
});
