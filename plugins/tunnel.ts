import { type IPlugin, type PluginContext, type AppEvents } from "bun_plugins";
import { BaseService } from "../src/utils/service";
import { BinaryManager } from "../src/utils/tunnel-helpers";
import { Config } from "../src/services/config.service";
import path from "path";
import { existsSync, readFileSync } from "fs";

/**
 * Playit config structure
 * The playit.gg agent stores its configuration in config.json
 */
interface PlayitConfig {
  secret?: string;
  tunnel_secret?: string;
  account_secret?: string;
}

class PlayitService extends BaseService {
  public readonly name = "PLAYIT";
  public readonly themeColor = "magenta";
  private readyResolver?: (v: boolean) => void;
  public claimUrl?: string;

  constructor(private binaryPath: string, private dataDir: string, private token?: string) {
    super();
  }

  async start(): Promise<boolean> {
    const waitReady = new Promise<boolean>((resolve) => {
      this.readyResolver = resolve;
    });

    // Build command args
    const args: string[] = [];
    
    // If we have a token, try to use it
    if (this.token) {
      args.push("--token", this.token);
    }
    
    // Add config path if exists
    const configPath = path.join(this.dataDir, "config.json");
    if (existsSync(configPath)) {
      args.push("--config", configPath);
    }

    await this.launch([this.binaryPath, ...args], {
      PLAYIT_DATA_DIR: this.dataDir,
    });

    return waitReady;
  }

  /**
   * Clean and parse playit output to extract meaningful messages
   */
  private parseOutput(line: string): string | null {
    // Skip empty lines
    const trimmed = line.trim();
    if (!trimmed) return null;

    // Extract claim URL
    if (line.includes("https://playit.gg/claim/")) {
      const match = line.match(/https:\/\/playit\.gg\/claim\/[a-zA-Z0-9]+/);
      if (match) {
        this.claimUrl = match[0];
        return `🔗 Setup URL: ${this.claimUrl}`;
      }
    }
    
    if (line.includes("connected") || line.includes("tunnel running") || line.includes("tunnel is ready")) {
      return `[info] ${trimmed}`;
    }
    
    if (line.includes("error") || line.includes("failed")) {
      return `[error] ${trimmed}`;
    }
    
    if (line.includes("warning")) {
      return `[warn] ${trimmed}`;
    }
    
    // Return cleaned message
    return trimmed;
  }

  protected handleLogic(line: string): void {
    const lower = line.toLowerCase();
    
    // Detect successful connection
    if (
      lower.includes("tunnel running") ||
      lower.includes("connected") ||
      lower.includes("http server listening") ||
      lower.includes("tunnel is ready")
    ) {
      this.readyResolver?.(true);
      this.readyResolver = undefined;
    }
  }
  
  /**
   * Get cleaned output for broadcasting
   */
  getCleanOutput(line: string): string | null {
    return this.parseOutput(line);
  }
}

export class TunnelPlugin implements IPlugin {
  name = "tunnel-playit";
  version = "1.0.0";
  description = "Provides a public tunnel for the Minecraft server using playit.gg";
  author = "Guardian Team";

  private context!: PluginContext;
  private service?: PlayitService;
  private isEnabled = false;

  async onLoad(context: PluginContext): Promise<void> {
    this.context = context;
    const config = Config.getInstance();
    const tunnelConfig = config.guardian.tunnel;

    if (!tunnelConfig.enabled) {
      return;
    }

    this.isEnabled = true;
    this.context.emit("log", {message: "Starting playit.gg tunnel...", level: "info"});

    try {
      const dataDir = path.join(config.guardian.paths.data, "playit");
      const binaryManager = new BinaryManager(dataDir, tunnelConfig.token);
      const binaryPath = await binaryManager.ensureBinary();

      // Check for existing config
      const configPath = path.join(dataDir, "config.json");
      let existingToken = tunnelConfig.token;
      
      if (!existingToken && existsSync(configPath)) {
        try {
          const playitConfig = JSON.parse(readFileSync(configPath, "utf-8")) as PlayitConfig;
          existingToken = playitConfig.secret || playitConfig.tunnel_secret;
        } catch (e) {
          // Ignore parse errors
        }
      }

      this.service = new PlayitService(binaryPath, dataDir, existingToken);
      
      this.service.on("data", (msg) => {
        // Check for claim URL in the output
        if (this.service?.claimUrl) {
          this.context.emit("log", { 
            message: `TUNNEL SETUP REQUIRED: Visit ${this.service.claimUrl} to authenticate`, 
            level: "warn" 
          });
          this.service.claimUrl = undefined; // Only show once
        }
        
        // Use cleaned output if available
        const cleanMsg = this.service?.getCleanOutput?.(msg);
        if (cleanMsg) {
          this.context.emit("log", { level: "info", message: cleanMsg });
        }
      });

      this.service.on("error", (msg) => {
        this.context.emit("error", msg);
      });

      // Start the service in the background
      this.service.start().then(() => {
        this.context.emit("log", {message: "Tunnel is active and running!", level: "info"});
      }).catch(err => {
        // Don't crash the app if tunnel fails to start
        this.context.emit("log", {message: `Tunnel background service warning: ${err.message}`, level: "warn"});
      });

      // Registrar manejadores de control
      this.context.on("tunnel:restart" as any, async () => {
        this.context.emit("log", {message: "Restarting tunnel...", level: "info"});
        if (this.service) await this.service.stop();
        await this.service?.start();
      });

      this.context.on("tunnel:stop" as any, async () => {
        this.context.emit("log", {message: "Stopping tunnel...", level: "info"});
        if (this.service) await this.service.stop();
      });

    } catch (err: any) {
      // Log error but don't crash - tunnel is optional
      this.context.emit("log", {message: `Tunnel skipped: ${err.message}`, level: "warn"});
    }
  }

  async onUnload(): Promise<void> {
    if (this.service) {
      await this.service.stop();
    }
  }
}
