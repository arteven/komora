import { describe, it, expect, vi, beforeEach } from "vitest";

const runMsbMock = vi.hoisted(() => vi.fn());
vi.mock("../../src/box/backend/msb.js", () => ({ runMsb: runMsbMock }));
const loadBoxMock = vi.hoisted(() => vi.fn(async () => ({ box: { name: "komora-box" } })));
vi.mock("../../src/box/index.js", () => ({ loadBox: loadBoxMock }));

import { attachCmd } from "../../src/commands/attach.js";

beforeEach(() => vi.clearAllMocks());

describe("attach command", () => {
  it("invokes msb exec -t with bash", async () => {
    await attachCmd({});
    expect(runMsbMock).toHaveBeenCalledWith(expect.arrayContaining(["exec", "-t", "komora-box", "bash"]), expect.anything());
  });
});
