import { type IPlugin, type PluginContext, type AppEvents } from "bun_plugins";
import { BaseService } from "../src/utils/service";
import { BinaryManager } from "../src/utils/tunnel-helpers";
import { Config } from "../src/services/config.service";
import path from "path";

class PlayitService extends BaseService {
  public readonly name = "PLAYIT";
  public readonly themeColor = "magenta";
  private readyResolver?: (v: boolean) => void;

  constructor(private binaryPath: string, private dataDir: string) {
    super();
  }

  async start(): Promise<boolean> {
    const waitReady = new Promise<boolean>((resolve) => {
      this.readyResolver = resolve;
    });

    await this.launch([this.binaryPath], {
      PLAYIT_DATA_DIR: this.dataDir,
    });

    return waitReady;
  }

  protected handleLogic(line: string): void {
    const lower = line.toLowerCase();
    if (
      lower.includes("tunnel running") ||
      lower.includes("connected") ||
      lower.includes("http server listening")
    ) {
      this.readyResolver?.(true);
      this.readyResolver = undefined;
    }
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

      this.service = new PlayitService(binaryPath, dataDir);
      
      this.service.on("data", (msg) => {
        this.context.emit("log", msg);
      });

      this.service.on("error", (msg) => {
        this.context.emit("error", msg);
      });

      // Start the service in the background
      this.service.start().then(() => {
        this.context.emit("log", {message: "Tunnel is active and running!", level: "info"});
      }).catch(err => {
        this.context.emit("error", {message: `Tunnel failed to start: ${err.message}`, level: "error"});
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
      this.context.emit("error", {message: `Failed to initialize tunnel: ${err.message}`, level: "error"});
    }
  }

  async onUnload(): Promise<void> {
    if (this.service) {
      await this.service.stop();
    }
  }
}
