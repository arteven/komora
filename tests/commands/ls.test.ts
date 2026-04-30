import { describe, it, expect, vi } from "vitest";
vi.mock("../../src/sandbox/msb.js", () => ({
  msb: { list: vi.fn(async () => [
    { name: "a", status: "running" },
    { name: "b", status: "stopped" },
  ]) },
}));
import { ls } from "../../src/commands/ls.js";

describe("ls command", () => {
  it("prints a two-column listing", async () => {
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await ls();
    const calls = out.mock.calls.map((c) => c[0]).join("");
    expect(calls).toMatch(/a\s+running/);
    expect(calls).toMatch(/b\s+stopped/);
    out.mockRestore();
  });
});
