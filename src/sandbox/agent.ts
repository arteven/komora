import type { Sandbox } from "microsandbox";

export interface RunAgentInput {
  sandbox: Sandbox;
  agent: string;
  argv: string[];
}

export function runAgent(input: RunAgentInput): Promise<number> {
  return input.sandbox.attach(input.agent, input.argv);
}
