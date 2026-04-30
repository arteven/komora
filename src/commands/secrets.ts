import { setSecret, removeSecret, listSecrets } from "../secrets/store.js";

async function readStdin(stream: NodeJS.ReadableStream = process.stdin): Promise<string> {
  let buf = "";
  for await (const chunk of stream) buf += chunk.toString();
  return buf;
}

async function promptNoEcho(label: string): Promise<string> {
  process.stderr.write(`${label}: `);
  process.stdin.setRawMode?.(true);
  let value = "";
  for await (const chunk of process.stdin) {
    const s = chunk.toString();
    if (s === "\n" || s === "\r") break;
    value += s;
  }
  process.stdin.setRawMode?.(false);
  process.stderr.write("\n");
  return value;
}

export async function secretsSet(name: string, opts: { fromStdin?: boolean }): Promise<void> {
  const value = opts.fromStdin ? (await readStdin()).trimEnd() : await promptNoEcho(`secret ${name}`);
  await setSecret(name, value);
}

export async function secretsList(): Promise<void> {
  const names = await listSecrets();
  if (names.length === 0) return;
  process.stdout.write(`${names.join("\n")}\n`);
}

export async function secretsRm(name: string): Promise<void> {
  await removeSecret(name);
}
