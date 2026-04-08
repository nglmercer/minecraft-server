import { EventEmitter } from "node:events";
import { type Subprocess } from "bun";

const COLORS = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m",
} as const;

type ColorName = keyof typeof COLORS;

const cleanPtyOutput = (message: string): string | null => {
  if (!message) return null;
  let clean = message.replace(/\x1B][^]*?(\x07|\x1B\\)/g, "");
  clean = clean.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
  clean = clean.replace(/[\u2500-\u257f]/g, "");
  clean = clean.replace(/[\x00-\x09\x0B-\x1F]/g, "");
  clean = clean.replace(/\r\n/g, "\n");
  clean = clean.replace(/\r/g, "");
  clean = clean.trim();
  if (clean.length === 0) return null;
  return clean;
};

const formatLog = (name: string, color: ColorName, message: string, options?: { timestamp?: boolean }) => {
  const cleanedMessage = cleanPtyOutput(message);
  if (!cleanedMessage) return null;
  const ansi = COLORS[color] || COLORS.reset;
  const timestamp = options?.timestamp !== false ? `[${new Date().toLocaleTimeString()}] ` : "";
  return `${ansi}${timestamp}[${name}]${COLORS.reset} ${cleanedMessage}`;
};

type ServiceProc = Subprocess<"pipe", "pipe", "pipe">;

export abstract class BaseService extends EventEmitter implements AsyncDisposable {
  protected proc?: ServiceProc;
  private lineBuffer: string = "";
  protected options: { timestamp?: boolean } = { timestamp: false };

  public abstract readonly name: string;
  public abstract readonly themeColor: ColorName;

  public setOptions(options: { timestamp?: boolean }) {
    this.options = { ...this.options, ...options };
  }

  async launch(cmd: string[], env: Record<string, string> = {}) {
    try {
      this.proc = Bun.spawn(cmd, {
        stdout: "pipe",
        stderr: "pipe",
        stdin: "pipe",
        env: {
          ...process.env,
          ...env,
        },
        onExit: (proc, exitCode) => {
          // Flush any remaining data in the buffer
          if (this.lineBuffer.trim()) {
            this.broadcast("data", this.lineBuffer);
            this.lineBuffer = "";
          }
          this.emit("exit", exitCode);
        },
      });

      // Procesar streams de forma asíncrona
      if (this.proc.stdout) this.processStream(this.proc.stdout);
      if (this.proc.stderr) this.processStream(this.proc.stderr);
      
    } catch (err) {
      const msg = `Fallo al iniciar: ${err instanceof Error ? err.message : String(err)}`;
      console.error(formatLog(this.name, "red", msg, this.options));
      throw err;
    }
  }

  private async processStream(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        if (text) {
          this.handlePtyData(text);
        }
      }
    } catch (err) {
      // Ignorar errores de stream (ej: proceso cerrado)
    } finally {
      reader.releaseLock();
    }
  }

  private handlePtyData(chunk: string) {
    this.lineBuffer += chunk;
    
    // Split by newlines and handle each complete line
    const lines = this.lineBuffer.split(/\r?\n/);
    
    // The last element is either an empty string (if chunk ended with \n)
    // or a partial line (if it didn't)
    this.lineBuffer = lines.pop() || "";

    for (const line of lines) {
      if (line.trim()) {
        this.broadcast("data", line);
      }
    }
  }

  private broadcast(event: "data" | "error", rawText: string) {
    this.handleLogic(rawText);
    this.emit(event, rawText);
  }

  protected abstract handleLogic(line: string): void;

  public async stop() {
    if (!this.proc || this.proc.killed) return;
    this.proc.kill("SIGTERM");
    let killed = false;
    const timeout = setTimeout(() => {
      if (!killed && this.proc && !this.proc.killed) {
        this.proc.kill("SIGKILL");
      }
    }, 2000);
    await this.proc.exited;
    killed = true;
    clearTimeout(timeout);
  }

  async [Symbol.asyncDispose]() {
    await this.stop();
  }
}
