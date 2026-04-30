import fs from "node:fs/promises";
import path from "node:path";
import lockfile from "proper-lockfile";
import { lockFile } from "../util/paths.js";

export async function withSandboxLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const lf = lockFile(name);
  await fs.mkdir(path.dirname(lf), { recursive: true });
  // Touch the file so proper-lockfile has a target.
  await fs.writeFile(lf, "", { flag: "a" });
  const release = await lockfile.lock(lf, { retries: { retries: 50, minTimeout: 20, maxTimeout: 200 } });
  try { return await fn(); } finally { await release(); }
}
