import { describe, it, expect, vi, beforeEach } from "vitest";

const upMock = vi.hoisted(() => vi.fn());
const loadBoxMock = vi.hoisted(() => vi.fn(async () => ({ box: { name: "komora-box" } })));

vi.mock("../../src/box/backend/lifecycle.js", () => ({ up: upMock, down: vi.fn(), pause: vi.fn(), resume: vi.fn(), destroy: vi.fn() }));
vi.mock("../../src/box/index.js", () => ({ loadBox: loadBoxMock }));

import { upCmd } from "../../src/commands/up.js";

beforeEach(() => { vi.clearAllMocks(); });

describe("up command", () => {
  it("starts the box by manifest name", async () => {
    await upCmd({});
    expect(upMock).toHaveBeenCalledWith("komora-box");
  });
});
