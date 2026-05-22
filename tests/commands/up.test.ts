import { describe, it, expect, vi, beforeEach } from "vitest";

const upMock = vi.hoisted(() => vi.fn());
const rebuildMock = vi.hoisted(() => vi.fn());
const statusMock = vi.hoisted(() => vi.fn());
const loadBoxMock = vi.hoisted(() => vi.fn(async () => ({
  box: { name: "komora-box" },
  secrets: { workload: [], identity: [] },
})));

vi.mock("../../src/box/backend/lifecycle.js", () => ({ up: upMock, down: vi.fn(), pause: vi.fn(), resume: vi.fn(), destroy: vi.fn() }));
vi.mock("../../src/box/backend/rebuild.js", () => ({ rebuild: rebuildMock }));
vi.mock("../../src/box/backend/status.js", () => ({ boxStatus: statusMock }));
vi.mock("../../src/box/index.js", () => ({ loadBox: loadBoxMock }));

import { upCmd } from "../../src/commands/up.js";

beforeEach(() => { vi.clearAllMocks(); });

describe("up command", () => {
  it("starts the box when stopped", async () => {
    statusMock.mockResolvedValue("stopped");
    await upCmd({});
    expect(upMock).toHaveBeenCalledWith("komora-box");
    expect(rebuildMock).not.toHaveBeenCalled();
  });

  it("rebuilds from snapshot when box is missing", async () => {
    statusMock.mockResolvedValue("missing");
    await upCmd({});
    expect(rebuildMock).toHaveBeenCalled();
    expect(upMock).not.toHaveBeenCalled();
  });

  it("rebuilds from snapshot when box has crashed", async () => {
    statusMock.mockResolvedValue("crashed");
    await upCmd({});
    expect(rebuildMock).toHaveBeenCalled();
    expect(upMock).not.toHaveBeenCalled();
  });

  it("is a no-op when box is already running", async () => {
    statusMock.mockResolvedValue("running");
    await upCmd({});
    expect(upMock).not.toHaveBeenCalled();
    expect(rebuildMock).not.toHaveBeenCalled();
  });
});
