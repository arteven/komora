import { describe, it, expect, vi } from "vitest";
vi.mock("../../src/sandbox/lifecycle.js", () => ({
  stopSandbox: vi.fn(),
  removeSandbox: vi.fn(),
}));
import { stopSandbox, removeSandbox } from "../../src/sandbox/lifecycle.js";
import { stop } from "../../src/commands/stop.js";
import { rm } from "../../src/commands/rm.js";

describe("stop/rm commands", () => {
  it("stop calls stopSandbox", async () => {
    await stop("foo");
    expect(stopSandbox).toHaveBeenCalledWith("foo");
  });
  it("rm calls removeSandbox", async () => {
    await rm("foo");
    expect(removeSandbox).toHaveBeenCalledWith("foo");
  });
});
