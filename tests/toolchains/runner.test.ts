import { describe, it, expect, vi, beforeEach } from "vitest";
import { runMountedToolchains, loadToolchainScripts, getToolchainScriptPath, AVAILABLE_TOOLCHAINS } from "../../src/toolchains/runner.js";

vi.mock("microsandbox", () => ({ Sandbox: {} }));

const mockReadFile = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, default: { ...actual, readFile: mockReadFile } };
});

const mockSandbox = {
  shell: vi.fn().mockResolvedValue({ success: true, code: 0, stdout: () => "", stderr: () => "" }),
};

describe("toolchain runner", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSandbox.shell.mockResolvedValue({ success: true, code: 0, stdout: () => "", stderr: () => "" });
    mockReadFile.mockReset();
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

  it("runMountedToolchains executes scripts via /.msb/scripts/ path", async () => {
    await runMountedToolchains(mockSandbox as any, [{ node: "22" }, { rust: "stable" }], false);
    expect(mockSandbox.shell).toHaveBeenCalledTimes(2);
    const calls = mockSandbox.shell.mock.calls;
    expect(calls[0][0]).toBe("/.msb/scripts/node '22'");
    expect(calls[1][0]).toBe("/.msb/scripts/rust 'stable'");
  });

  it("runMountedToolchains does nothing for empty list", async () => {
    await runMountedToolchains(mockSandbox as any, [], false);
    expect(mockSandbox.shell).not.toHaveBeenCalled();
  });

  it("loadToolchainScripts reads script files for each toolchain entry", async () => {
    mockReadFile.mockResolvedValue("#!/bin/bash\necho hello");

    const scripts = await loadToolchainScripts([{ node: "22" }, { bun: "latest" }]);

    expect(scripts).toEqual({
      node: "#!/bin/bash\necho hello",
      bun: "#!/bin/bash\necho hello",
    });
    expect(mockReadFile).toHaveBeenCalledTimes(2);
  });
});
