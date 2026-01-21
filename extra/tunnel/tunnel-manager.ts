import { existsSync } from "fs";
import { BaseService } from "../terminal";

export interface tunnelConfig {
  binaryPath: string;
  dataDir: string;
  token?: string;
  port: number;
  args?: string[];
  [key: string]: any;
}

export class TunnelManager extends BaseService {
  public readonly name = "PLAYIT";
  public readonly themeColor = "magenta";

  private _readyResolver?: (value: boolean) => void;
  private _readyRejecter?: (reason?: any) => void;

  constructor(private config: tunnelConfig) {
    super();
  }

  async start(): Promise<boolean> {
    if (!existsSync(this.config.binaryPath)) {
      throw new Error(`Binary not found at ${this.config.binaryPath}`);
    }

    const command: string[] = [this.config.binaryPath];

    if (this.config.args && Array.isArray(this.config.args)) {
      command.push(...this.config.args);
    }

    console.log(`launching: ${command.join(" ")}`);

    const waitReady = new Promise<boolean>((resolve, reject) => {
      this._readyResolver = resolve;
      this._readyRejecter = reject;
    });

    const exitListener = (code: number) => {
      if (this._readyRejecter) {
        this._readyRejecter(
          new Error(
            `exit code ${code}`,
          ),
        );
        this._cleanupResolvers();
      }
    };
    this.once("exit", exitListener);

    await this.launch(command, {
      PLAYIT_DATA_DIR: this.config.dataDir,
    });

    try {
      await waitReady;
      this.off("exit", exitListener);
      return true;
    } catch (e) {
      this.off("exit", exitListener);
      throw e;
    }
  }

  protected handleLogic(line: string): void {
    const lowerLine = line.toLowerCase();

    if (
      lowerLine.includes("tunnel running") ||
      lowerLine.includes("connected") ||
      lowerLine.includes("http server listening")
    ) {
      if (this._readyResolver) {
        this._readyResolver(true);
        this._cleanupResolvers();
      }
    }
  }

  private _cleanupResolvers() {
    this._readyResolver = undefined;
    this._readyRejecter = undefined;
  }

  getConfig() {
    return this.config;
  }
}
