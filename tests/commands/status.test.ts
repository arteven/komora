import { describe, it, expect, vi, beforeEach } from "vitest";

const statusMock = vi.hoisted(() => vi.fn());
const probeMock = vi.hoisted(() => vi.fn());
const loadBoxMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/box/backend/status.js", () => ({ boxStatus: statusMock }));
vi.mock("../../src/box/backend/ssh.js", () => ({ probeSshd: probeMock }));
vi.mock("../../src/box/index.js", () => ({ loadBox: loadBoxMock }));

import { statusCmd } from "../../src/commands/status.js";

beforeEach(() => vi.clearAllMocks());

describe("status command", () => {
  it("prints VM state and sshd readiness", async () => {
    loadBoxMock.mockResolvedValue({
      box: { name: "komora-box", ssh: { enabled: true }, ports: [{ host: 2222, guest: 22 }], volumes: [] },
    });
    statusMock.mockResolvedValue("running");
    probeMock.mockResolvedValue(true);
    const lines: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    (process.stdout as any).write = (s: string) => { lines.push(s); return true; };
    try { await statusCmd({}); } finally { (process.stdout as any).write = orig; }
    const out = lines.join("");
    expect(out).toMatch(/komora-box.*running/);
    expect(out).toMatch(/sshd.*ready/);
  });
});
