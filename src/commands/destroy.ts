import { loadBox } from "../box/index.js";
import { destroy } from "../box/backend/lifecycle.js";

export interface DestroyOpts { manifest?: string; volumes?: boolean; }

export async function destroyCmd(opts: DestroyOpts): Promise<void> {
  const b = await loadBox(opts.manifest);
  await destroy(b.box.name);
}
