import * as pty from "node-pty";
import { msb } from "./msb.js";

export interface RunAgentInput {
  name: string;
  agent: string;
  argv: string[];
}

export function runAgent(input: RunAgentInput): Promise<number> {
  const { command, args } = msb.execCommand(input.name, input.agent, input.argv);
  const cols = process.stdout.columns ?? 80;
  const rows = process.stdout.rows ?? 24;
  const child = pty.spawn(command, args, {
    name: "xterm-256color",
    cols,
    rows,
    cwd: process.cwd(),
    env: process.env as Record<string, string>,
  });

  child.onData((d) => process.stdout.write(d));
  if (process.stdin.isTTY) {
    process.stdin.setRawMode?.(true);
    process.stdin.on("data", (d) => child.write(d.toString()));
  }
  const onResize = () => child.resize(process.stdout.columns ?? cols, process.stdout.rows ?? rows);
  process.stdout.on("resize", onResize);
  const onSigint = () => child.kill("SIGINT");
  process.on("SIGINT", onSigint);

  return new Promise((resolve) => {
    child.onExit(({ exitCode }) => {
      process.stdout.off("resize", onResize);
      process.off("SIGINT", onSigint);
      if (process.stdin.isTTY) process.stdin.setRawMode?.(false);
      resolve(exitCode);
    });
  });
}
