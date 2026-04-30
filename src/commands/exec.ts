import { msb } from "../sandbox/msb.js";
import { runAgent } from "../sandbox/agent.js";

export async function exec(name: string, cmd: string, args: string[]): Promise<number> {
  const status = await msb.status(name);
  if (status !== "running") throw new Error(`sandbox '${name}' is not running (status: ${status})`);
  return runAgent({ name, agent: cmd, argv: args });
}
