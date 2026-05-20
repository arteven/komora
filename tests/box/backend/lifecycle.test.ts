import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock runMsb for up and destroy (which now use CLI)
vi.mock("../../../src/box/backend/msb.js", () => ({
  runMsb: vi.fn(async () => {}),
}));

const { handle, getMock } = vi.hoisted(() => {
  const handle = {
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  };
  const getMock = vi.fn(async () => handle);
  return { handle, getMock };
});

vi.mock("microsandbox", () => ({
  Sandbox: { get: getMock },
  SandboxNotFoundError: class extends Error {},
}));

import { up, down, pause, resume, destroy } from "../../../src/box/backend/lifecycle.js";
import { runMsb } from "../../../src/box/backend/msb.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("lifecycle", () => {
  it("up calls msb start", async () => {
    await up("komora-box");
    const [args] = vi.mocked(runMsb).mock.calls[0];
    expect(args).toContain("start");
    expect(args).toContain("komora-box");
  });

  it("down calls handle.stop", async () => {
    await down("komora-box");
    expect(handle.stop).toHaveBeenCalled();
  });

  it("pause calls handle.pause", async () => {
    await pause("komora-box");
    expect(handle.pause).toHaveBeenCalled();
  });

  it("resume calls handle.resume", async () => {
    await resume("komora-box");
    expect(handle.resume).toHaveBeenCalled();
  });

  it("destroy calls msb stop and remove", async () => {
    await destroy("komora-box");
    const calls = vi.mocked(runMsb).mock.calls.map(([args]) => args);
    expect(calls.some((a) => a.includes("stop") && a.includes("komora-box"))).toBe(true);
    expect(calls.some((a) => a.includes("remove") && a.includes("komora-box"))).toBe(true);
  });
});
