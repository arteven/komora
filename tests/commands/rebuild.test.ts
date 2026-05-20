import { describe, it, expect, vi, beforeEach } from "vitest";

const rebuildMock = vi.hoisted(() => vi.fn());
const loadBoxMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/box/backend/rebuild.js", () => ({ rebuild: rebuildMock }));
vi.mock("../../src/box/index.js", () => ({ loadBox: loadBoxMock }));

import { rebuildCmd } from "../../src/commands/rebuild.js";

beforeEach(() => { vi.clearAllMocks(); });

describe("rebuild command", () => {
  it("loads manifest and invokes rebuild()", async () => {
    loadBoxMock.mockResolvedValue({});
    await rebuildCmd({});
    expect(rebuildMock).toHaveBeenCalled();
  });
});
