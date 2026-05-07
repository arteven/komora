import type { Sandbox } from "microsandbox";

export interface RunAgentInput {
  sandbox: Sandbox;
  command: string;
  defaultArgs: string[];
  argv: string[];
  workspaceDir: string;
}

export function runAgent(input: RunAgentInput): Promise<number> {
  const args = [...input.defaultArgs, ...input.argv];
  return input.sandbox.attachWith(input.command, (b) => b.args(args).cwd(input.workspaceDir));
}
