import { describe, it, expect, vi, beforeEach } from "vitest";

const downMock = vi.hoisted(() => vi.fn());
const loadBoxMock = vi.hoisted(() => vi.fn(async () => ({ box: { name: "komora-box" } })));

vi.mock("../../src/box/backend/lifecycle.js", () => ({ up: vi.fn(), down: downMock, pause: vi.fn(), resume: vi.fn(), destroy: vi.fn() }));
vi.mock("../../src/box/index.js", () => ({ loadBox: loadBoxMock }));

import { downCmd } from "../../src/commands/down.js";

beforeEach(() => { vi.clearAllMocks(); });

describe("down command", () => {
  it("stops the box by manifest name", async () => {
    await downCmd({});
    expect(downMock).toHaveBeenCalledWith("komora-box");
  });
});
