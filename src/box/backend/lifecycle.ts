import fs from "node:fs";
import path from "node:path";
import { Sandbox, SandboxNotFoundError } from "microsandbox";
import { boxStateFile } from "../../util/paths.js";

export async function up(name: string): Promise<void> {
  await Sandbox.start(name);
}

export async function down(name: string): Promise<void> {
  try {
    const h = await Sandbox.get(name);
    await (h as any).stop();
  } catch (e) {
    if (e instanceof SandboxNotFoundError) return;
    throw e;
  }
}

export async function pause(name: string): Promise<void> {
  const h = await Sandbox.get(name);
  await (h as any).pause();
  fs.mkdirSync(path.dirname(boxStateFile(name)), { recursive: true });
  fs.writeFileSync(boxStateFile(name), "paused", "utf8");
}

export async function resume(name: string): Promise<void> {
  const h = await Sandbox.get(name);
  await (h as any).resume();
  try { fs.rmSync(boxStateFile(name)); } catch { /* ignore */ }
}

export async function destroy(name: string): Promise<void> {
  try {
    await Sandbox.remove(name);
  } catch (e) {
    if (e instanceof SandboxNotFoundError) return;
    throw e;
  }
  try { fs.rmSync(boxStateFile(name)); } catch { /* ignore */ }
}
