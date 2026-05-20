import { describe, it, expect, vi, beforeEach } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn: spawnMock }));
const loadBoxMock = vi.hoisted(() => vi.fn(async () => ({
  box: { name: "komora-box", ssh: { enabled: true, user: "komora", authorizedKeysFromHost: "/k" }, ports: [{ host: 2222, guest: 22 }] },
})));
vi.mock("../../src/box/index.js", () => ({ loadBox: loadBoxMock }));

import { sshCmd } from "../../src/commands/ssh.js";

beforeEach(() => {
  vi.clearAllMocks();
  spawnMock.mockReturnValue({ on: (e: string, cb: any) => { if (e === "exit") setTimeout(() => cb(0), 0); } });
});

describe("ssh command", () => {
  it("invokes ssh on the forwarded port", async () => {
    await sshCmd({});
    expect(spawnMock).toHaveBeenCalledWith("ssh", expect.arrayContaining(["-p", "2222", "komora@127.0.0.1"]), expect.objectContaining({ stdio: "inherit" }));
  });

  it("errors when ssh section is missing", async () => {
    loadBoxMock.mockResolvedValueOnce({ box: { name: "x", ssh: null, ports: [] } });
    await expect(sshCmd({})).rejects.toThrow(/ssh.*disabled|no ssh/i);
  });
});
