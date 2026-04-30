import { describe, it, expect } from "vitest";
import { workspaceSlug } from "../../src/util/workspace.js";

describe("workspaceSlug", () => {
  it("uses the last path segment", () => {
    expect(workspaceSlug("/home/arek/code/foo")).toBe("foo");
  });

  it("strips trailing slashes", () => {
    expect(workspaceSlug("/home/arek/code/foo/")).toBe("foo");
  });

  it("lowercases and replaces non-alphanumeric runs with single dashes", () => {
    expect(workspaceSlug("/tmp/My Project!")).toBe("my-project");
  });

  it("trims leading and trailing dashes", () => {
    expect(workspaceSlug("/tmp/--weird--")).toBe("weird");
  });

  it("falls back to 'workspace' when the segment slugifies to empty", () => {
    expect(workspaceSlug("/")).toBe("workspace");
    expect(workspaceSlug("/tmp/!!!")).toBe("workspace");
  });
});
