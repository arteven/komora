import { describe, it, expect, vi, beforeEach } from "vitest";

const pauseMock = vi.hoisted(() => vi.fn());
const resumeMock = vi.hoisted(() => vi.fn());
const loadBoxMock = vi.hoisted(() => vi.fn(async () => ({ box: { name: "komora-box" } })));

vi.mock("../../src/box/backend/lifecycle.js", () => ({ up: vi.fn(), down: vi.fn(), pause: pauseMock, resume: resumeMock, destroy: vi.fn() }));
vi.mock("../../src/box/index.js", () => ({ loadBox: loadBoxMock }));

import { pauseCmd, resumeCmd } from "../../src/commands/pause.js";

beforeEach(() => { vi.clearAllMocks(); });

describe("pause command", () => {
  it("pauses the box by manifest name", async () => {
    await pauseCmd({});
    expect(pauseMock).toHaveBeenCalledWith("komora-box");
  });
});

describe("resume command", () => {
  it("resumes the box by manifest name", async () => {
    await resumeCmd({});
    expect(resumeMock).toHaveBeenCalledWith("komora-box");
  });
});
