import { describe, it, expect, vi, beforeEach } from "vitest";
import { runToolchains, getToolchainScriptPath, AVAILABLE_TOOLCHAINS } from "../../src/toolchains/runner.js";

vi.mock("../../src/sandbox/msb.js", () => ({
  msb: {
    execInSandbox: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("toolchain runner", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("AVAILABLE_TOOLCHAINS lists all 6 recipes", () => {
    expect(AVAILABLE_TOOLCHAINS.sort()).toEqual(
      ["bun", "dotnet", "go", "node", "python", "rust"]
    );
  });

  it("getToolchainScriptPath returns path for known toolchain", () => {
    const p = getToolchainScriptPath("node");
    expect(p).toMatch(/toolchains\/node\.sh$/);
  });

  it("getToolchainScriptPath throws for unknown toolchain", () => {
    expect(() => getToolchainScriptPath("java")).toThrow(/unknown toolchain.*java/i);
  });

  it("runToolchains executes scripts in order", async () => {
    const { msb } = await import("../../src/sandbox/msb.js");
    await runToolchains("test-sandbox", [{ node: "22" }, { rust: "stable" }]);
    expect(msb.execInSandbox).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(msb.execInSandbox).mock.calls;
    expect(calls[0][0]).toBe("test-sandbox");
    expect(calls[0][1]).toContain("node.sh");
    expect(calls[0][2]).toEqual(["22"]);
    expect(calls[1][0]).toBe("test-sandbox");
    expect(calls[1][1]).toContain("rust.sh");
    expect(calls[1][2]).toEqual(["stable"]);
  });

  it("runToolchains does nothing for empty list", async () => {
    const { msb } = await import("../../src/sandbox/msb.js");
    await runToolchains("test-sandbox", []);
    expect(msb.execInSandbox).not.toHaveBeenCalled();
  });
});
