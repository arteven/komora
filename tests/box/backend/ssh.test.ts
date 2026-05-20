import { describe, it, expect, vi } from "vitest";

const connectMock = vi.hoisted(() => vi.fn());
vi.mock("node:net", () => ({
  createConnection: connectMock,
}));

import { probeSshd } from "../../../src/box/backend/ssh.js";

describe("probeSshd", () => {
  it("resolves true if connection emits ready", async () => {
    connectMock.mockImplementation(() => {
      const handlers: Record<string, any> = {};
      return {
        on: (ev: string, cb: any) => { handlers[ev] = cb; return this; },
        once: (ev: string, cb: any) => { handlers[ev] = cb; if (ev === "connect") setTimeout(cb, 0); },
        end: vi.fn(),
        destroy: vi.fn(),
        setTimeout: vi.fn(),
      };
    });
    await expect(probeSshd(2222, 100)).resolves.toBe(true);
  });

  it("resolves false on connection error", async () => {
    connectMock.mockImplementation(() => ({
      on: vi.fn(),
      once: (ev: string, cb: any) => { if (ev === "error") setTimeout(() => cb(new Error("ECONNREFUSED")), 0); },
      end: vi.fn(),
      destroy: vi.fn(),
      setTimeout: vi.fn(),
    }));
    await expect(probeSshd(2222, 100)).resolves.toBe(false);
  });

  it("resolves false after timeout", async () => {
    connectMock.mockImplementation(() => ({
      on: vi.fn(),
      once: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
      setTimeout: (_: number, cb: any) => { setTimeout(cb, 0); },
    }));
    await expect(probeSshd(2222, 50)).resolves.toBe(false);
  });
});
