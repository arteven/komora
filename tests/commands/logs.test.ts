import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/sandbox/_sdk.js", () => ({
  sdk: {
    logs: vi.fn((_n: string, onLine: (l: string) => void) => {
      onLine("line one");
      onLine("line two");
      return Promise.resolve();
    }),
  },
}));

import { logs } from "../../src/commands/logs.js";

describe("logs command", () => {
  it("forwards each line to stderr", async () => {
    const w = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await logs("foo");
    expect(w).toHaveBeenCalledWith("line one\n");
    expect(w).toHaveBeenCalledWith("line two\n");
    w.mockRestore();
  });
});
