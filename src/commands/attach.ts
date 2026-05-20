import { loadBox } from "../box/index.js";
import { runMsb } from "../box/backend/msb.js";

export interface AttachOpts { manifest?: string; }

export async function attachCmd(opts: AttachOpts): Promise<void> {
  const b = await loadBox(opts.manifest);
  await runMsb(["exec", "-t", b.box.name, "bash"], { stdio: "inherit" });
}
