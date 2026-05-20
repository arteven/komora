import { describe, it, expect, vi, beforeEach } from "vitest";

const runMsbMock = vi.hoisted(() => vi.fn());
vi.mock("../../src/box/backend/msb.js", () => ({ runMsb: runMsbMock }));
const loadBoxMock = vi.hoisted(() => vi.fn(async () => ({ box: { name: "komora-box" } })));
vi.mock("../../src/box/index.js", () => ({ loadBox: loadBoxMock }));

import { logsCmd } from "../../src/commands/logs.js";

beforeEach(() => vi.clearAllMocks());

describe("logs command", () => {
  it("invokes msb logs with the box name", async () => {
    await logsCmd({});
    expect(runMsbMock).toHaveBeenCalledWith(expect.arrayContaining(["logs", "komora-box"]), expect.anything());
  });
  it("appends --follow when -f is passed", async () => {
    await logsCmd({ follow: true });
    expect(runMsbMock).toHaveBeenCalledWith(expect.arrayContaining(["logs", "komora-box", "--follow"]), expect.anything());
  });
});
