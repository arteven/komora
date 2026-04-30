import { msb } from "../sandbox/msb.js";

export async function ls(): Promise<void> {
  const items = await msb.list();
  if (items.length === 0) return;
  const width = Math.max(...items.map((i) => i.name.length));
  for (const i of items) {
    process.stdout.write(`${i.name.padEnd(width)}  ${i.status}\n`);
  }
}
