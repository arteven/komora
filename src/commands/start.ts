import { msb } from "../sandbox/msb.js";

export async function start(name: string): Promise<void> {
  await msb.start(name);
}
