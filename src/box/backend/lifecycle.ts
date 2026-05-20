import { Sandbox, SandboxNotFoundError } from "microsandbox";

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
}

export async function resume(name: string): Promise<void> {
  const h = await Sandbox.get(name);
  await (h as any).resume();
}

export async function destroy(name: string): Promise<void> {
  try {
    await Sandbox.remove(name);
  } catch (e) {
    if (e instanceof SandboxNotFoundError) return;
    throw e;
  }
}
