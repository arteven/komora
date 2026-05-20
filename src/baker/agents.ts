const KNOWN = new Set(["claude", "opencode", "gemini", "copilot", "codex"]);

export function agentScript(name: string): string {
  if (!KNOWN.has(name)) throw new Error(`unknown agent: ${name}`);
  return `bash /opt/komora/install/agent-${name}.sh`;
}
