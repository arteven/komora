import { loadBox } from "../box/index.js";
import { up } from "../box/backend/lifecycle.js";
import { rebuild } from "../box/backend/rebuild.js";
import { boxStatus } from "../box/backend/status.js";

export interface UpOpts { manifest?: string; }

export async function upCmd(opts: UpOpts): Promise<void> {
  const b = await loadBox(opts.manifest);
  const status = await boxStatus(b.box.name);
  if (status === "running") return;
  if (status === "stopped") {
    await up(b.box.name);
  } else {
    await rebuild(b);
  }
}
