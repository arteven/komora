import { loadBox } from "../box/index.js";
import { up } from "../box/backend/lifecycle.js";

export interface UpOpts { manifest?: string; }

export async function upCmd(opts: UpOpts): Promise<void> {
  const b = await loadBox(opts.manifest);
  await up(b.box.name);
}
