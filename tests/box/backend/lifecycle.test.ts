import { describe, it, expect, vi, beforeEach } from "vitest";

const { handle, getMock } = vi.hoisted(() => {
  const handle = {
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    remove: vi.fn(),
  };
  const getMock = vi.fn(async () => handle);
  return { handle, getMock };
});

vi.mock("microsandbox", () => ({
  Sandbox: { get: getMock, start: vi.fn(async () => handle), remove: vi.fn() },
  SandboxNotFoundError: class extends Error {},
}));

import { up, down, pause, resume, destroy } from "../../../src/box/backend/lifecycle.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("lifecycle", () => {
  it("up calls Sandbox.start", async () => {
    await up("komora-box");
    expect((await import("microsandbox")).Sandbox.start).toHaveBeenCalledWith("komora-box");
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

  it("destroy calls Sandbox.remove", async () => {
    await destroy("komora-box");
    expect((await import("microsandbox")).Sandbox.remove).toHaveBeenCalledWith("komora-box");
  });
});
