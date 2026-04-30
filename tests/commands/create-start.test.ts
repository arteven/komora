import { describe, it, expect, vi } from "vitest";
vi.mock("../../src/config/index.js", () => ({ loadResolvedConfig: vi.fn() }));
vi.mock("../../src/sandbox/lifecycle.js", () => ({ ensureSandbox: vi.fn() }));
vi.mock("../../src/sandbox/msb.js", () => ({ msb: { start: vi.fn() } }));

import { loadResolvedConfig } from "../../src/config/index.js";
import { ensureSandbox } from "../../src/sandbox/lifecycle.js";
import { msb } from "../../src/sandbox/msb.js";
import { create } from "../../src/commands/create.js";
import { start } from "../../src/commands/start.js";

const fakeCfg = { sandboxName: "foo-claude-nodejs" } as never;

describe("create/start commands", () => {
  it("create resolves config and ensures sandbox without running an agent", async () => {
    (loadResolvedConfig as ReturnType<typeof vi.fn>).mockResolvedValue(fakeCfg);
    await create({ agent: "claude", profile: "nodejs", workspaceDir: "/tmp/foo" });
    expect(ensureSandbox).toHaveBeenCalledWith(fakeCfg);
  });

  it("start calls msb.start by name", async () => {
    await start("foo-claude-nodejs");
    expect(msb.start).toHaveBeenCalledWith("foo-claude-nodejs");
  });
});
