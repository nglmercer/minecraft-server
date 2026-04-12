import { spawn } from "bun";
import { EventEmitter } from "node:events";
import path from "node:path";
import { Config } from "../services/config.service";
import { BasePluginManager } from "../plugins/index";
import type {
  GuardianStatus,
  ExitEvent,
  GuardianProcess,
} from "../types/types";
import {
  GuardianMessages,
  GuardianEvents,
  MinecraftCommands,
  StreamTypes,
  SpawnOptions,
  ExitCodes,
  Timeouts,
  ErrorMessages,
} from "../constants";
import { convertMinecraftColors, supportsColor } from "../utils/colors";

export class Guardian extends EventEmitter {
  protected process: GuardianProcess | null = null;
  protected _status: GuardianStatus = "OFFLINE";
  protected crashCount = 0;
  protected intentionalStop = false;
  protected config: Config;
  protected pluginManager: BasePluginManager;

  constructor(config?: Config, pluginManager?: BasePluginManager) {
    super();
    this.config = config || Config.getInstance();
    this.pluginManager = pluginManager || new BasePluginManager();

    // Security: If Node/Bun process dies, kill the child.
    process.on("beforeExit", () => this.kill());

    // Listen for commands sent by plugins
    this.pluginManager.on("server:write", (command: string) => {
      this.write(command);
    });

    this.pluginManager.on("server:start", () => {
      this.start();
    });

    this.pluginManager.on("server:stop", () => {
      this.stop();
    });

    this.pluginManager.on("server:restart", async () => {
      await this.stop();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await this.start();
    });

    // Forward internal events to plugins
    this.on(GuardianEvents.OUTPUT, (line) => this.pluginManager.emit("output", line));
    this.on(GuardianEvents.LOG, (msg) => this.pluginManager.emit("log", msg));
    this.on(GuardianEvents.ERROR, (err) => this.pluginManager.emit("error", err));
    this.on(GuardianEvents.STATUS, (status) => this.pluginManager.emit("status", status));
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
        this.emit(GuardianEvents.PID, this.process.pid);
      }

      if (this.process.stdout) {
        this.processOutput(this.process.stdout, StreamTypes.STDOUT);
      }
      if (this.process.stderr) {
        this.processOutput(this.process.stderr, StreamTypes.STDERR);
      }

      this.setStatus("ONLINE");

      // Wait for process to finish
      const exitCode = await this.process.exited;
      this.handleExit(exitCode);
    } catch (e) {
      this.emit(GuardianEvents.ERROR, `${ErrorMessages.SPAWN_FAILED}: ${e}`);
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
      stdin: SpawnOptions.PIPE,
      stdout: SpawnOptions.PIPE,
      stderr: SpawnOptions.PIPE,
    };
  }

  write(command: string) {
    if (this._status !== "ONLINE" || !this.process?.stdin) return;
    try {
      this.process.stdin.write(command + "\n");
      this.process.stdin.flush();
    } catch (e) {
      this.emit(GuardianEvents.ERROR, `${ErrorMessages.STDIN_WRITE_FAILED}: ${e}`);
    }
  }

  /**
   * Stops the server by sending command and waiting, or killing if it hangs.
   */
  async stop() {
    if (this._status === "OFFLINE" || !this.process) return;

    this.intentionalStop = true;
    this.setStatus("STOPPING");
    this.emit(GuardianEvents.LOG, GuardianMessages.STOPPING);

    this.write(MinecraftCommands.SAVE_STOP);

    // Promise that resolves if the process dies naturally
    const exitPromise = this.process.exited;

    // Timer to force closure
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error(ErrorMessages.TIMEOUT)), Timeouts.GRACEFUL_SHUTDOWN);
    });

    try {
      await Promise.race([exitPromise, timeoutPromise]);
    } catch (e) {
      this.emit(GuardianEvents.LOG, GuardianMessages.HUNG);
      this.kill();
    }
  }

  /**
   * Forces immediate process death
   */
  kill() {
    if (this.process && !this.process.killed) {
      this.process.kill(); // SIGKILL in Bun
    }
  }

  protected setStatus(s: GuardianStatus) {
    if (this._status !== s) {
      this._status = s;
      this.emit(GuardianEvents.STATUS, s);
    }
  }

  protected handleExit(code: number | null) {
    // If already offline, avoid double processing
    if (this._status === "OFFLINE" && !this.process) return;

    this.process = null;
    let isCrash = false;
    let reason: string = GuardianMessages.UNKNOWN;

    // 0 = Normal, 130 = SIGINT (Manual Ctrl+C), 143 = SIGTERM
    if (this.intentionalStop) {
      reason = GuardianMessages.MANUAL_STOP;
    } else if (code === ExitCodes.SUCCESS || code === ExitCodes.SIGINT || code === ExitCodes.SIGTERM) {
      reason = GuardianMessages.NORMAL_EXIT;
    } else {
      isCrash = true;
      reason = GuardianMessages.CRASH_REASON(code);
    }

    const event: ExitEvent = { code, isCrash, reason };
    this.emit(GuardianEvents.STOPPED, event);

    if (isCrash) {
      this.setStatus("CRASHED");
      this.handleCrashRecovery();
    } else {
      this.setStatus("OFFLINE");
      this.crashCount = 0; // Reset counter on clean shutdown
    }
  }

  protected handleCrashRecovery() {
    const gConfig = this.config.guardian;

    if (gConfig.autoRestart && this.crashCount < gConfig.maxRetries) {
      this.crashCount++;
      const delay = gConfig.retryDelayMs;

      this.emit(
        GuardianEvents.LOG,
        `Server crashed. Restarting in ${delay}ms (Attempt ${this.crashCount}/${gConfig.maxRetries})`,
      );

      setTimeout(() => this.start(), delay);
    } else {
      this.emit(GuardianEvents.ERROR, "Max retries reached or auto-restart disabled.");
      this.setStatus("OFFLINE");
    }
  }

  /**
   * Reads streams line by line using a buffer to avoid
   * cutting sentences in half. Preserves ANSI color codes.
   */
  private async processOutput(
    stream: ReadableStream | null,
    type: typeof StreamTypes.STDOUT | typeof StreamTypes.STDERR,
  ) {
    if (!stream) return;

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = ""; // Text accumulator

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode current chunk and add it to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process full lines
        let lineEndIndex;
        while ((lineEndIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.substring(0, lineEndIndex);
          buffer = buffer.substring(lineEndIndex + 1);

          // Convert Minecraft color codes (§) to ANSI codes
          if (supportsColor()) {
            line = convertMinecraftColors(line);
          }

          if (line) {
            this.emit(GuardianEvents.OUTPUT, line);
            if (type === StreamTypes.STDERR) this.emit(GuardianEvents.ERROR_LOG, line);
          }
        }
      }

      // Process remainder if stream closes without a final newline
      if (buffer.trim()) {
        let line = buffer.trim();
        if (supportsColor()) {
          line = convertMinecraftColors(line);
        }
        this.emit(GuardianEvents.OUTPUT, line);
      }
    } catch (e) {
      // Ignore closed stream errors
    } finally {
      reader.releaseLock();
    }
  }
  public getConfig(): Config {
    return this.config;
  }
}
