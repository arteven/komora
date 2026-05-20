import { loadBox } from "../box/index.js";
import { runMsb } from "../box/backend/msb.js";

export interface LogsOpts { manifest?: string; follow?: boolean; }

export async function logsCmd(opts: LogsOpts): Promise<void> {
  const b = await loadBox(opts.manifest);
  const args = ["logs", b.box.name];
  if (opts.follow) args.push("--follow");
  await runMsb(args, { stdio: "inherit" });
}
