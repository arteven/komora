import type { AgentDefinition } from "../config/types.js";

export const gemini: AgentDefinition = {
  template: "docker/sandbox-templates:gemini-docker",
  command: "gemini",
  defaultArgs: [],
  authVolumes: [{ type: "volume", name: "gemini-home", target: "/home/agent/.gemini" }],
  defaultSecrets: ["GEMINI_API_KEY"],
  defaultDomains: ["generativelanguage.googleapis.com"],
};
