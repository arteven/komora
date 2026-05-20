import { describe, it, expect, vi, beforeEach } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn: spawnMock }));

import { runMsb } from "../../../src/box/backend/msb.js";

beforeEach(() => { spawnMock.mockReset(); });

describe("msb wrapper", () => {
  it("spawns msb with args and inherits stdio by default", async () => {
    spawnMock.mockReturnValue({ on: (ev: string, cb: any) => { if (ev === "exit") cb(0); }, killed: false });
    await runMsb(["logs", "komora-box"]);
    expect(spawnMock).toHaveBeenCalledWith("msb", ["logs", "komora-box"], expect.objectContaining({ stdio: "inherit" }));
  });

  it("throws on non-zero exit", async () => {
    spawnMock.mockReturnValue({ on: (ev: string, cb: any) => { if (ev === "exit") cb(2); }, killed: false });
    await expect(runMsb(["x"])).rejects.toThrow(/exited with code 2/);
  });
});
