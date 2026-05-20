import { describe, it, expect, vi, beforeEach } from "vitest";

const destroyMock = vi.hoisted(() => vi.fn());
const loadBoxMock = vi.hoisted(() => vi.fn(async () => ({ box: { name: "komora-box" } })));

vi.mock("../../src/box/backend/lifecycle.js", () => ({ up: vi.fn(), down: vi.fn(), pause: vi.fn(), resume: vi.fn(), destroy: destroyMock }));
vi.mock("../../src/box/index.js", () => ({ loadBox: loadBoxMock }));

import { destroyCmd } from "../../src/commands/destroy.js";

beforeEach(() => { vi.clearAllMocks(); });

describe("destroy command", () => {
  it("destroys the box by manifest name", async () => {
    await destroyCmd({});
    expect(destroyMock).toHaveBeenCalledWith("komora-box");
  });
});
