import { loadBox } from "../box/index.js";
import { down } from "../box/backend/lifecycle.js";

export interface DownOpts { manifest?: string; }

export async function downCmd(opts: DownOpts): Promise<void> {
  const b = await loadBox(opts.manifest);
  await down(b.box.name);
}
