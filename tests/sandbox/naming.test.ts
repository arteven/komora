import { describe, it, expect } from "vitest";
import { sandboxName } from "../../src/sandbox/naming.js";

describe("sandboxName", () => {
  it("joins workspace, agent, profile with dashes", () => {
    expect(sandboxName({ workspaceSlug: "foo", agent: "claude", profile: "nodejs" }))
      .toBe("foo-claude-nodejs");
  });

  it("uses the override when provided", () => {
    expect(sandboxName({ workspaceSlug: "foo", agent: "claude", profile: "nodejs", override: "custom" }))
      .toBe("custom");
  });

  it("rejects an empty override", () => {
    expect(() => sandboxName({ workspaceSlug: "foo", agent: "claude", profile: "nodejs", override: "" }))
      .toThrow(/override.*empty/i);
  });
});
