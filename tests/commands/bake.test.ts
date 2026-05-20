import { describe, it, expect, vi, beforeEach } from "vitest";

const bakeMock = vi.hoisted(() => vi.fn());
const loadBoxMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/box/backend/image.js", () => ({ bake: bakeMock }));
vi.mock("../../src/box/index.js", () => ({ loadBox: loadBoxMock }));

import { bakeCmd } from "../../src/commands/bake.js";

beforeEach(() => { vi.clearAllMocks(); });

describe("bake command", () => {
  it("loads the manifest and invokes bake()", async () => {
    loadBoxMock.mockResolvedValue({ baseSnapshotName: "komora-base" });
    await bakeCmd({});
    expect(loadBoxMock).toHaveBeenCalled();
    expect(bakeMock).toHaveBeenCalled();
  });

  it("passes through explicit manifest path", async () => {
    loadBoxMock.mockResolvedValue({});
    await bakeCmd({ manifest: "/custom/box.yaml" });
    expect(loadBoxMock).toHaveBeenCalledWith("/custom/box.yaml");
  });
});
