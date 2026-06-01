import { Sandbox, SandboxNotFoundError } from "microsandbox";
import { runMsb } from "./msb.js";

export async function up(name: string): Promise<void> {
  await runMsb(["start", name], { stdio: "pipe" });
}

export async function down(name: string): Promise<void> {
  try {
    const h = await Sandbox.get(name);
    await h.stop();
  } catch (e) {
    if (e instanceof SandboxNotFoundError) return;
    throw e;
  }
}

export async function pause(name: string): Promise<void> {
  const h = await Sandbox.get(name);
  await (h as any).pause();
}

export async function resume(name: string): Promise<void> {
  const h = await Sandbox.get(name);
  await (h as any).resume();
}

export async function destroy(name: string): Promise<void> {
  // Use msb CLI for stop+remove to avoid the SDK race between stop and remove.
  await runMsb(["stop", name], { stdio: "pipe" }).catch(() => {});
  await runMsb(["remove", name], { stdio: "pipe" }).catch(() => {});
}
