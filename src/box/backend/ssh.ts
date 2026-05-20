import { createConnection } from "node:net";

export async function probeSshd(port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection(port, "127.0.0.1");
    sock.setTimeout(timeoutMs, () => { sock.destroy(); resolve(false); });
    sock.once("connect", () => { sock.end(); resolve(true); });
    sock.once("error", () => { sock.destroy(); resolve(false); });
  });
}

export async function waitForSshd(port: number, totalMs = 30_000, stepMs = 500): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < totalMs) {
    if (await probeSshd(port, stepMs)) return true;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return false;
}
