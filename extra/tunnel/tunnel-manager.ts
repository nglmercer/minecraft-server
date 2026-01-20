import { spawn, type ChildProcess } from "child_process";
import { existsSync } from "fs";
export interface tunnelConfig {
  binaryPath: string;
  dataDir: string;
  token?: string;
  port: number;
  [key: string]: any;
}
export class TunnelManager {
  private process?: ChildProcess;

  constructor(private config: tunnelConfig) {
    this.config = config;
  }

  async start(): Promise<boolean> {
    if (!existsSync(this.config.binaryPath)) {
      throw new Error(`Binary not found at ${this.config.binaryPath}`);
    }

    // Argumentos corregidos: playit usa espacios o '=' según la versión
    const args = []; // El comando principal de playit-agent

    if (this.config.token && this.config.token !== "YOUR_TOKEN_HERE") {
      args.push("--secret", this.config.token);
    }

    this.process = spawn(this.config.binaryPath, args, {
      env: { ...process.env, PLAYIT_DATA_DIR: this.config.dataDir },
      stdio: ["ignore", "pipe", "pipe"],
    });

    return new Promise((resolve, reject) => {
      let output = "";

      this.process?.stdout?.on("data", (data) => {
        const line = data.toString();
        output += line;
        process.stdout.write(line); // Para ver el link de reclamo en consola

        // Detectar si el túnel ya está operativo
        if (line.includes("tunnel running") || line.includes("connected")) {
          resolve(true);
        }
      });

      this.process?.stderr?.on("data", (data) => {
        console.error(`[Playit Error] ${data}`);
      });

      this.process?.on("error", (err) => {
        reject(err);
      });
    });
  }

  async stop() {
    if (this.process) {
      this.process.kill();
      return new Promise((resolve) => this.process?.on("exit", resolve));
    }
  }
  getConfig() {
    return this.config;
  }
  getProcess() {
    return this.process;
  }
}
