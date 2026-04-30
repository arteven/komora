import { describe, it, expect, vi } from "vitest";

const events: Record<string, ((data: unknown) => void)[]> = {};
const ptyMock = {
  onData: (cb: (s: string) => void) => { (events.data ??= []).push(cb); return { dispose: () => undefined }; },
  onExit: (cb: (e: { exitCode: number; signal?: number }) => void) => { (events.exit ??= []).push(cb); return { dispose: () => undefined }; },
  resize: vi.fn(),
  kill: vi.fn(),
  write: vi.fn(),
};
vi.mock("node-pty", () => ({ spawn: vi.fn(() => ptyMock) }));

vi.mock("../../src/sandbox/msb.js", () => ({
  msb: { execCommand: vi.fn(() => ({ command: "msb", args: ["exec", "name", "claude"] })) },
}));

import { runAgent } from "../../src/sandbox/agent.js";

describe("runAgent", () => {
  it("returns the exit code from the in-sandbox process verbatim", async () => {
    const promise = runAgent({ name: "name", agent: "claude", argv: [] });
    setTimeout(() => events.exit?.[0]({ exitCode: 7 }), 0);
    await expect(promise).resolves.toBe(7);
  });
});
