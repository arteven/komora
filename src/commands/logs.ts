import { sdk } from "../sandbox/_sdk.js";

export async function logs(name: string): Promise<void> {
  await sdk.logs(name, (line) => process.stderr.write(`${line}\n`));
}
