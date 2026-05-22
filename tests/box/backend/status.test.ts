import { describe, it, expect, vi, beforeEach } from "vitest";

const listMock = vi.hoisted(() => vi.fn());

vi.mock("microsandbox", () => ({
  Sandbox: { list: listMock, get: vi.fn() },
}));

import { boxStatus } from "../../../src/box/backend/status.js";

beforeEach(() => listMock.mockReset());

describe("boxStatus", () => {
  it("returns 'missing' when sandbox is not listed", async () => {
    listMock.mockResolvedValue([]);
    expect(await boxStatus("komora-box")).toBe("missing");
  });

  it("returns 'running' when listed and status running", async () => {
    listMock.mockResolvedValue([{ name: "komora-box", status: "running" }]);
    expect(await boxStatus("komora-box")).toBe("running");
  });

  it("returns 'stopped' when listed and status stopped/draining", async () => {
    for (const s of ["stopped", "draining"]) {
      listMock.mockResolvedValue([{ name: "komora-box", status: s }]);
      expect(await boxStatus("komora-box")).toBe("stopped");
    }
  });

  it("returns 'crashed' when listed and status crashed", async () => {
    listMock.mockResolvedValue([{ name: "komora-box", status: "crashed" }]);
    expect(await boxStatus("komora-box")).toBe("crashed");
  });
});
