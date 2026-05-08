import { describe, it, expect, vi, beforeEach } from "vitest";
import { runToolchains, getToolchainScriptPath, AVAILABLE_TOOLCHAINS } from "../../src/toolchains/runner.js";

vi.mock("microsandbox", () => ({ Sandbox: {} }));

const mockSandbox = {
  shell: vi.fn().mockResolvedValue({ success: true, code: 0, stdout: () => "", stderr: () => "" }),
};

describe("toolchain runner", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSandbox.shell.mockResolvedValue({ success: true, code: 0, stdout: () => "", stderr: () => "" });
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
    await runToolchains(mockSandbox as any, [{ node: "22" }, { rust: "stable" }], false);
    expect(mockSandbox.shell).toHaveBeenCalledTimes(2);
    const calls = mockSandbox.shell.mock.calls;
    expect(calls[0][0]).toContain("set -- '22'");
    expect(calls[1][0]).toContain("set -- 'stable'");
  });

  it("runToolchains does nothing for empty list", async () => {
    await runToolchains(mockSandbox as any, [], false);
    expect(mockSandbox.shell).not.toHaveBeenCalled();
  });
});
