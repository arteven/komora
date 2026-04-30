function write(level: "info" | "warn" | "error", msg: string): void {
  const prefix = level === "info" ? "komora" : `komora ${level}`;
  process.stderr.write(`${prefix}: ${msg}\n`);
}

export const log = {
  info: (m: string) => write("info", m),
  warn: (m: string) => write("warn", m),
  error: (m: string) => write("error", m),
};
