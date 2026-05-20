import { setSecret, listSecrets, removeSecret } from "../secrets/keychain.js";

export interface SetOpts { value?: string; fromStdin?: boolean; }

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8").replace(/\n$/, "");
}

export async function setCmd(name: string, opts: SetOpts): Promise<void> {
  let value = opts.value;
  if (value === undefined && opts.fromStdin) value = await readStdin();
  if (value === undefined) throw new Error("secret value required (use --value or --from-stdin)");
  await setSecret(name, value);
}

export async function listCmd(): Promise<void> {
  const names = await listSecrets();
  for (const n of names.sort()) process.stdout.write(`${n}\n`);
}

export async function rmCmd(name: string): Promise<void> {
  await removeSecret(name);
}
