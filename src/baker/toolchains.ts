import type { Toolchain } from "../box/types.js";

const SUPPORTED = new Set(["node", "python", "go", "rust", "bun", "dotnet"]);

export function toolchainScript(t: Toolchain): string {
  const [name, version] = Object.entries(t)[0];
  if (!SUPPORTED.has(name)) {
    throw new Error(`unknown toolchain: ${name}`);
  }
  return `bash /opt/komora/install/${name}.sh "${version}"`;
}
