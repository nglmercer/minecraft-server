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

const formatLog = (name: string, color: ColorName, message: string) => {
  const cleanedMessage = cleanPtyOutput(message);
  if (!cleanedMessage) return null;

  const ansi = COLORS[color] || COLORS.reset;
  const timestamp = new Date().toLocaleTimeString();

  return `${ansi}[${timestamp}] [${name}]${COLORS.reset} ${cleanedMessage}`;
};

type ServiceProc = Subprocess<"pipe", "pipe", "pipe">;

export abstract class BaseService
  extends EventEmitter
  implements AsyncDisposable
{
  protected proc?: ServiceProc;
  // Buffer para acumular fragmentos de la PTY
  private lineBuffer: string = "";

  public abstract readonly name: string;
  public abstract readonly themeColor: ColorName;

  async launch(cmd: string[], env: Record<string, string> = {}) {
    try {
      this.proc = Bun.spawn(cmd, {
        // USAMOS PTY COMO PEDISTE
        terminal: {
          cols: 80, // Ancho estándar para evitar saltos raros
          rows: 24,
          data: (terminal, rawData) => {
            // Convertimos los bytes crudos a texto
            const text = new TextDecoder().decode(rawData);
            //process.stdout.write(text);
            this.handlePtyData(text);
          },
        },
        // Mantenemos stdout/stderr como pipe por si acaso, aunque 'terminal' tiene prioridad en Bun
        stdout: "pipe",
        stderr: "pipe",
        stdin: "pipe",
        env: {
          ...process.env,
          ...env,
        },
        onExit: (proc, exitCode) => {
          this.emit("exit", exitCode);
        },
      });

      // No llamamos a processStreams() estándar porque usamos el callback 'data' del PTY
    } catch (err) {
      const msg = `Fallo al iniciar: ${err instanceof Error ? err.message : String(err)}`;
      console.error(formatLog(this.name, "red", msg));
      throw err;
    }
  }

  // Manejador especial para datos que vienen del PTY
  private handlePtyData(chunk: string) {
    this.lineBuffer += chunk;

    if (cleanPtyOutput(chunk)) this.broadcast("data", chunk);
  }

  private broadcast(event: "data" | "error", rawText: string) {
    // Lógica interna (detectar links, etc.)
    this.handleLogic(rawText);

    // Formatear log bonito
    const formatted = formatLog(this.name, this.themeColor, rawText);

    if (formatted) {
      this.emit(event, formatted);
    }
  }

  protected abstract handleLogic(line: string): void;

  public async stop() {
    if (!this.proc || this.proc.killed) return;

    const msg = formatLog(this.name, "yellow", "Deteniendo...");
    if (msg) console.log(msg);

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
