import { spawn } from "bun";
import { EventEmitter } from "node:events";
import path from "node:path";
import { Config } from "./Config";
import type {
  GuardianStatus,
  ExitEvent,
  GuardianProcess,
  GuardianPlugin,
} from "./types";

export class Guardian extends EventEmitter {
  protected process: GuardianProcess | null = null;
  protected _status: GuardianStatus = "OFFLINE";
  protected crashCount = 0;
  protected intentionalStop = false;
  protected config: Config;
  protected plugins: Map<string, GuardianPlugin> = new Map();

  constructor(config?: Config) {
    super();
    this.config = config || Config.getInstance();

    // Seguridad: Si el proceso de Node/Bun muere, matar al hijo.
    process.on("beforeExit", () => this.kill());
  }

  get status() {
    return this._status;
  }

  async start() {
    if (this._status === "ONLINE" || this._status === "STARTING") return;

    await this.config.loadSync();

    this.intentionalStop = false;
    this.setStatus("STARTING");

    const cmd = this.buildSpawnCommand();
    const opts = this.buildSpawnOptions();

    try {
      this.emit("log", `Starting server with: ${cmd.join(" ")}`);

      this.process = spawn(cmd, opts);

      if (this.process.pid) {
        this.emit("pid", this.process.pid);
      }

      // Manejo robusto de streams con buffers
      this.processOutput(this.process.stdout, "OUT");
      this.processOutput(this.process.stderr, "ERR");

      this.setStatus("ONLINE");

      // Esperar a que el proceso termine
      const exitCode = await this.process.exited;
      this.handleExit(exitCode);
    } catch (e) {
      this.emit("error", `Failed to spawn process: ${e}`);
      this.setStatus("OFFLINE");
      this.process = null;
    }
  }

  protected buildSpawnCommand(): string[] {
    const srv = this.config.server;
    return [
      srv.javaBin,
      ...srv.jvmOptions,
      "-jar",
      path.resolve(srv.cwd, srv.jarPath),
      ...srv.programArgs,
    ];
  }

  protected buildSpawnOptions() {
    return {
      cwd: this.config.server.cwd,
      stdin: "pipe" as const,
      stdout: "pipe" as const,
      stderr: "pipe" as const,
    };
  }

  write(command: string) {
    if (this._status !== "ONLINE" || !this.process?.stdin) return;
    try {
      this.process.stdin.write(command + "\n");
      this.process.stdin.flush();
    } catch (e) {
      this.emit("error", `Failed to write to stdin: ${e}`);
    }
  }

  /**
   * Detiene el servidor enviando comando y esperando, o matando si se cuelga.
   */
  async stop() {
    if (this._status === "OFFLINE" || !this.process) return;

    this.intentionalStop = true;
    this.setStatus("STOPPING");
    this.emit("log", "Stopping server gracefully...");

    this.write("stop");

    // Promesa que se resuelve si el proceso muere naturalmente
    const exitPromise = this.process.exited;

    // Timer para forzar el cierre
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error("TIMEOUT")), 10000);
    });

    try {
      await Promise.race([exitPromise, timeoutPromise]);
    } catch (e) {
      this.emit("log", "Server hung, forcing kill (SIGKILL)...");
      this.kill();
    }
  }

  /**
   * Fuerza la muerte inmediata del proceso
   */
  kill() {
    if (this.process && !this.process.killed) {
      this.process.kill(); // SIGKILL en Bun
    }
  }

  protected setStatus(s: GuardianStatus) {
    if (this._status !== s) {
      this._status = s;
      this.emit("status", s);
    }
  }

  protected handleExit(code: number | null) {
    // Si ya es offline, evitar doble procesamiento
    if (this._status === "OFFLINE" && !this.process) return;

    this.process = null;
    let isCrash = false;
    let reason = "Unknown";

    // 0 = Normal, 130 = SIGINT (Ctrl+C manual), 143 = SIGTERM
    if (this.intentionalStop) {
      reason = "Manual Stop";
    } else if (code === 0 || code === 130 || code === 143) {
      reason = "Normal Exit";
    } else {
      isCrash = true;
      reason = `Crash (Exit Code ${code ?? "Signal"})`;
    }

    const event: ExitEvent = { code, isCrash, reason };
    this.emit("stopped", event);

    if (isCrash) {
      this.setStatus("CRASHED");
      this.handleCrashRecovery();
    } else {
      this.setStatus("OFFLINE");
      this.crashCount = 0; // Resetear contador en apagado limpio
    }
  }

  protected handleCrashRecovery() {
    const gConfig = this.config.guardian;

    if (gConfig.autoRestart && this.crashCount < gConfig.maxRetries) {
      this.crashCount++;
      const delay = gConfig.retryDelayMs;

      this.emit(
        "log",
        `Server crashed. Restarting in ${delay}ms (Attempt ${this.crashCount}/${gConfig.maxRetries})`,
      );

      setTimeout(() => this.start(), delay);
    } else {
      this.emit("error", "Max retries reached or auto-restart disabled.");
      this.setStatus("OFFLINE");
    }
  }

  /**
   * Lee streams línea por línea utilizando un buffer para evitar
   * cortar frases a la mitad.
   */
  private async processOutput(
    stream: ReadableStream | null,
    type: "OUT" | "ERR",
  ) {
    if (!stream) return;

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = ""; // Acumulador de texto

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decodificar el chunk actual y añadirlo al buffer
        buffer += decoder.decode(value, { stream: true });

        // Procesar líneas completas
        let lineEndIndex;
        while ((lineEndIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.substring(0, lineEndIndex).trim();
          buffer = buffer.substring(lineEndIndex + 1); // Lo que sobra se queda en el buffer

          if (line) {
            this.emit("output", line);
            if (type === "ERR") this.emit("error-log", line);
          }
        }
      }

      // Procesar remanente si el stream se cierra sin un salto de línea final
      if (buffer.trim()) {
        this.emit("output", buffer.trim());
      }
    } catch (e) {
      // Ignorar errores de stream cerrado
    } finally {
      reader.releaseLock();
    }
  }
  /**
   * Registra y carga un plugin
   */
  public use(plugin: GuardianPlugin) {
    if (this.plugins.has(plugin.name)) {
      console.warn(`Plugin ${plugin.name} ya está registrado.`);
      return;
    }

    try {
      plugin.onLoad(this);
      this.plugins.set(plugin.name, plugin);
      this.emit("log", `Plugin loaded: ${plugin.name} v${plugin.version}`);
    } catch (e) {
      this.emit("error", `Error loading plugin ${plugin.name}: ${e}`);
    }
  }
  public getConfig(): Config {
    return this.config;
  }
}
