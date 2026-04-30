import fs from "node:fs/promises";
import path from "node:path";
import { configDir, secretsFile } from "../util/paths.js";

async function readAll(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(secretsFile(), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return {};
    return parsed as Record<string, string>;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
}

async function writeAll(values: Record<string, string>): Promise<void> {
  const dir = configDir();
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  // Ensure dir mode even if it pre-existed.
  await fs.chmod(dir, 0o700).catch(() => undefined);
  const file = secretsFile();
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(values, null, 2), { mode: 0o600 });
  await fs.rename(tmp, file);
  await fs.chmod(file, 0o600).catch(() => undefined);
}

export async function setSecret(name: string, value: string): Promise<void> {
  if (!name) throw new Error("secret name must not be empty");
  const all = await readAll();
  all[name] = value;
  await writeAll(all);
}

export async function removeSecret(name: string): Promise<void> {
  const all = await readAll();
  delete all[name];
  await writeAll(all);
}

export async function listSecrets(): Promise<string[]> {
  return Object.keys(await readAll()).sort();
}

export async function getSecret(name: string): Promise<string | undefined> {
  return (await readAll())[name];
}
