import path from "node:path";
import { fileURLToPath } from "node:url";
import { msb } from "../sandbox/msb.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const AVAILABLE_TOOLCHAINS = ["node", "bun", "python", "go", "rust", "dotnet"];

export function getToolchainScriptPath(name: string): string {
  if (!AVAILABLE_TOOLCHAINS.includes(name)) {
    throw new Error(`unknown toolchain '${name}'. Available: ${AVAILABLE_TOOLCHAINS.join(", ")}`);
  }
  return path.join(__dirname, `${name}.sh`);
}

export async function runToolchains(
  sandbox: string,
  toolchain: Record<string, string>[],
): Promise<void> {
  for (const entry of toolchain) {
    const [name, version] = Object.entries(entry)[0];
    const scriptPath = getToolchainScriptPath(name);
    await msb.execInSandbox(sandbox, scriptPath, [version]);
  }
}
