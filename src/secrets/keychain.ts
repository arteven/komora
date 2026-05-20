import { readFile, writeFile, mkdir, chmod, rename } from "node:fs/promises";
import path from "node:path";
import { secretsFile, configDir } from "../util/paths.js";

interface Store {
  [name: string]: string;
}

async function readStore(): Promise<Store> {
  try {
    const text = await readFile(secretsFile(), "utf8");
    return JSON.parse(text) as Store;
  } catch (e: any) {
    if (e?.code === "ENOENT") return {};
    throw e;
  }
}

async function writeStore(s: Store): Promise<void> {
  await mkdir(configDir(), { recursive: true });
  const tmp = secretsFile() + ".tmp";
  await writeFile(tmp, JSON.stringify(s, null, 2), { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, secretsFile());
  await chmod(secretsFile(), 0o600);
}

export async function setSecret(name: string, value: string): Promise<void> {
  const s = await readStore();
  s[name] = value;
  await writeStore(s);
}

export async function getSecret(name: string): Promise<string | undefined> {
  const s = await readStore();
  return s[name];
}

export async function listSecrets(): Promise<string[]> {
  return Object.keys(await readStore());
}

export async function removeSecret(name: string): Promise<void> {
  const s = await readStore();
  delete s[name];
  await writeStore(s);
}
