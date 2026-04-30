import { describe, it, expect, vi } from "vitest";
vi.mock("../../src/secrets/store.js", () => ({
  setSecret: vi.fn(),
  removeSecret: vi.fn(),
  listSecrets: vi.fn(async () => ["A", "B"]),
}));
import { setSecret, removeSecret, listSecrets } from "../../src/secrets/store.js";
import { secretsList, secretsSet, secretsRm } from "../../src/commands/secrets.js";

describe("secrets commands", () => {
  it("list prints names to stdout (one per line)", async () => {
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      await secretsList();
      expect(out).toHaveBeenCalledWith("A\nB\n");
    } finally {
      out.mockRestore();
    }
  });

  it("set with --from-stdin reads stdin", async () => {
    process.stdin.push("supersecret");
    process.stdin.push(null);
    await secretsSet("X", { fromStdin: true });
    expect(setSecret).toHaveBeenCalledWith("X", "supersecret");
  });

  it("rm calls store.removeSecret", async () => {
    await secretsRm("X");
    expect(removeSecret).toHaveBeenCalledWith("X");
  });
});
