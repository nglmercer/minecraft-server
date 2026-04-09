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
    const args: string[] = ["--stdout"];
    
    // If we have a token (secret), try to use it
    if (this.token) {
      args.push("--secret", this.token);
    }
    
    // Check for secret file
    const secretPath = path.join(this.dataDir, "playit.toml");
    if (existsSync(secretPath)) {
      args.push("--secret_path", secretPath);
    }

    await this.launch([this.binaryPath, ...args], {
      PLAYIT_DATA_DIR: this.dataDir,
    });

    return waitReady;
  }

  /**
   * Clean and parse playit output to extract meaningful messages
   */
  private parseOutput(line: string): { level: "info" | "warn" | "error" | "status", message: string | null } {
    let trimmed = line.trim();
    if (!trimmed) return { level: "info", message: null };

    // 0. Detect new playit-agent log format: 2024-03-20T...  INFO ...: message
    // and extract the message part
    const logMatch = trimmed.match(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+(\w+)\s+(.+?):\s+(.+)$/);
    if (logMatch && logMatch[3]) {
      trimmed = logMatch[3];
    }

    // 1. Extract Claim URL
    if (line.includes("https://playit.gg/claim/")) {
      const match = line.match(/https:\/\/playit\.gg\/claim\/[a-z0-9]+/);
      if (match) {
        this.claimUrl = match[0];
        return { 
          level: "warn", 
          message: `🔗 Setup URL: ${this.claimUrl}`
        };
      }
    }

    // 2. Detect JSON logs (Playit often outputs JSON when using certain flags)
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const json = JSON.parse(trimmed);
        const levelStr = String(json.level || "info").toLowerCase();
        const level = (levelStr === "error" || levelStr === "panic") ? "error" : 
                      (levelStr === "warn" || levelStr === "warning") ? "warn" : "info";
        
        return { 
          level, 
          message: json.message || trimmed 
        };
      } catch (e) {
        // Not valid JSON, continue to raw parsing
      }
    }

    // 3. Status/Connection detection (case-insensitive)
    const lower = trimmed.toLowerCase();
    if (
      lower.includes("tunnel running") || 
      lower.includes("connected to playit.gg") || 
      lower.includes("tunnel is ready") ||
      lower.includes("http server listening")
    ) {
      return { level: "status", message: `✅ ${trimmed}` };
    }

    // 4. Error/Warning detection
    if (lower.includes("error") || lower.includes("failed") || lower.includes("panic")) {
      return { level: "error", message: trimmed };
    }

    if (lower.includes("warning") || lower.includes("warn")) {
      return { level: "warn", message: trimmed };
    }

    // 5. Version/Start info
    if (lower.includes("playit-cli") || lower.includes("version")) {
      return { level: "info", message: `[System] ${trimmed}` };
    }

    // Return cleaned message for everything else
    return { level: "info", message: trimmed };
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
  getCleanOutput(line: string): { level: "info" | "warn" | "error" | "status", message: string | null } {
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
    const {log,storage} = this.context;
    const config = Config.getInstance();
    const tunnelConfig = config.guardian.tunnel;

    if (!tunnelConfig.enabled) {
      return;
    }

    this.isEnabled = true;
    try {
      const dataDir = path.join(config.guardian.paths.data, "playit");
      const binaryManager = new BinaryManager(dataDir, tunnelConfig.token);
      const binaryPath = await binaryManager.ensureBinary();
      const token = await storage.get("token", tunnelConfig.token);
      await storage.set("token", tunnelConfig.token || token);
      
      // Check for existing config
      let existingToken = tunnelConfig.token || token;
      this.service = new PlayitService(binaryPath, dataDir, existingToken);
      
      log.info("Starting playit.gg tunnel...", { existingToken: existingToken ? "Present" : "Missing" });
      
      this.service.on("data", (msg) => {
        const result = this.service?.getCleanOutput(msg);
        if (result && result.message) {
          const level = result.level === "status" ? "info" : result.level;
          this.context.emit("log", { 
            level, 
            message: `[Tunnel] ${result.message}` 
          });

          if (result.level === "status") {
            this.context.emit("status", result.message);
          }
        }
      });

      this.service.on("error", (msg) => {
        log.error(msg);
      });

      // Start the service in the background
      this.service.start().then(() => {
        log.info("Tunnel is active and running!");
      }).catch(err => {
        // Don't crash the app if tunnel fails to start
        log.warn(`Tunnel background service warning: ${err.message}`);
      });

      // Registrar manejadores de control
      this.context.on("tunnel:restart" as any, async () => {
        log.info("Restarting tunnel...");
        if (this.service) await this.service.stop();
        await this.service?.start();
      });

      this.context.on("tunnel:stop" as any, async () => {
        log.info("Stopping tunnel...");
        if (this.service) await this.service.stop();
      });

    } catch (err) {
      // Log error but don't crash - tunnel is optional
      const errorMessage = err instanceof Error ? err.message : err;
      log.warn(`Tunnel skipped: ${errorMessage}`);
    }
  }

  async onUnload(): Promise<void> {
    if (this.service) {
      await this.service.stop();
    }
  }
}
if (import.meta.main) {
  // Test script for PlayitService
  const config = Config.getInstance();
  const tunnelConfig = config.guardian.tunnel;
  const dataDir = path.join(config.guardian.paths.data, "playit");
  const binaryManager = new BinaryManager(dataDir, tunnelConfig.token);
  
  console.log("--- PlayitService Test ---");
  console.log(`Data Dir: ${dataDir}`);
  
  const binaryPath = await binaryManager.ensureBinary();
  const service = new PlayitService(binaryPath, dataDir, tunnelConfig.token);
  
  service.on("data", (msg) => {
    const result = service.getCleanOutput(msg);
    console.log("data",result)
  });

  service.on("error", (msg) => {
    console.error(msg);
  });

  service.on("exit", (code) => {
    process.exit(code);
  });

  console.log("Starting service...");
  await service.start();
}