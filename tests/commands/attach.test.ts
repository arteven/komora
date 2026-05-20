import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn: spawnMock }));
const loadBoxMock = vi.hoisted(() => vi.fn(async () => ({ box: { name: "komora-box" } })));
vi.mock("../../src/box/index.js", () => ({ loadBox: loadBoxMock }));

import { attachCmd } from "../../src/commands/attach.js";

beforeEach(() => vi.clearAllMocks());

describe("attach command", () => {
  it("invokes msb exec -t with bash", async () => {
    const child = Object.assign(new EventEmitter(), { stdout: null, stderr: null });
    spawnMock.mockReturnValue(child);
    const p = attachCmd({});
    setImmediate(() => child.emit("exit", 0));
    await p;
    expect(spawnMock).toHaveBeenCalledWith("msb", expect.arrayContaining(["exec", "-t", "komora-box", "bash"]), expect.anything());
  });
});
