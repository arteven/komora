import { loadBox } from "../box/index.js";
import { boxStatus } from "../box/backend/status.js";
import { probeSshd } from "../box/backend/ssh.js";

export interface StatusOpts { manifest?: string; }

export async function statusCmd(opts: StatusOpts): Promise<void> {
  const b = await loadBox(opts.manifest);
  const state = await boxStatus(b.box.name);
  process.stdout.write(`${b.box.name}: ${state}\n`);

  if (b.box.ssh?.enabled) {
    const port = b.box.ports.find((p: any) => p.guest === 22)?.host;
    if (port) {
      const ok = await probeSshd(port, 1500);
      process.stdout.write(`  sshd (port ${port}): ${ok ? "ready" : "not ready"}\n`);
    }
  }

  if (b.box.volumes?.length > 0) {
    process.stdout.write(`  volumes: ${b.box.volumes.map((v: any) => v.name).join(", ")}\n`);
  }
}
