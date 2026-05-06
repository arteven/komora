import { describe, it, expect } from "vitest";
import { sandboxName } from "../../src/sandbox/naming.js";

describe("sandboxName", () => {
  it("joins workspace and agent", () => {
    expect(sandboxName({ workspaceSlug: "komora", agent: "claude" })).toBe("komora-claude");
  });

  it("uses override when provided", () => {
    expect(sandboxName({ workspaceSlug: "komora", agent: "claude", override: "my-sandbox" })).toBe("my-sandbox");
  });

  it("throws on empty override", () => {
    expect(() => sandboxName({ workspaceSlug: "komora", agent: "claude", override: "" })).toThrow("--name override must not be empty");
  });
});
