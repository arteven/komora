import { describe, it, expect } from "vitest";

describe("cli", () => {
  it("loads without throwing", async () => {
    const savedArgv = process.argv;
    process.argv = ["node", "cli.js", "--help"];
    const exitCalls: number[] = [];
    const realExit = process.exit;
    // Don't throw — just record the call so parseAsync's catch() doesn't see an unhandled rejection
    (process as any).exit = (code: number) => { exitCalls.push(code); };
    try {
      await import("../src/cli.js");
    } finally {
      (process as any).exit = realExit;
      process.argv = savedArgv;
    }
    expect(exitCalls.length).toBeGreaterThan(0);
  });
});
