import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/config/index.js", () => ({
  loadResolvedConfig: vi.fn(async () => ({
    agent: "claude",
    profile: { name: "n", image: "i:t" },
    raw: {},
    workspaceDir: "/tmp/foo",
    workspaceSlug: "foo",
    sandboxName: "foo-claude-n",
  })),
}));

import { configShow } from "../../src/commands/config-show.js";

describe("config show", () => {
  it("prints YAML by default", async () => {
    const w = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await configShow({ agent: "claude", workspaceDir: "/tmp/foo", json: false });
    const out = w.mock.calls.map((c) => c[0]).join("");
    expect(out).toMatch(/^agent: claude/m);
    w.mockRestore();
  });

  it("prints JSON with --json", async () => {
    const w = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await configShow({ agent: "claude", workspaceDir: "/tmp/foo", json: true });
    const out = w.mock.calls.map((c) => c[0]).join("");
    expect(JSON.parse(out).agent).toBe("claude");
    w.mockRestore();
  });
});
