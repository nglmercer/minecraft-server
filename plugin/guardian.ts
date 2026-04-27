import { type IPlugin, type PluginContext } from "bun_plugins";
import { GuardianSystem } from "../src/core/system";
import { join } from "node:path";

/**
 * GuardianPlugin
 * 
 * This class wraps the entire GuardianSystem to be used as a plugin
 * by another application or plugin manager.
 */
export class GuardianPlugin implements IPlugin {
  // Plugin metadata - can be overridden via constructor or context
  name = "guardian-core";
  version = "1.0.0";
  description = "Minecraft Server Guardian System as a Plugin";
  author = "Guardian Team";

  private system: GuardianSystem;
  private context!: PluginContext;
  private isRunning = false;

  constructor(options?: { name?: string; version?: string }) {
    this.system = new GuardianSystem();
    if (options?.name) this.name = options.name;
    if (options?.version) this.version = options.version;
  }

  /**
   * Called when the plugin is loaded by the host application
   */
  async onLoad(context: PluginContext): Promise<void> {
    this.context = context;
    const defaultDirPlugins = join(context.config.pluginsDir, "mcplugins");
    // Get configuration from context storage or use defaults
    const config = await this.context.storage.get("guardian-config", {
      pluginsDir: defaultDirPlugins,
      autoStart: true,
    });
    const pluginsDir = config?.pluginsDir || defaultDirPlugins;

    // Log initialization
    this.context.emit("log", {
      message: `Initializing ${this.name} plugin...`,
      level: "info",
    });

    try {
      // Initialize the underlying system
      await this.system.init(pluginsDir);

      // Auto-start if configured
      if (config?.autoStart !== false) {
        await this.start();
      }
    } catch (error) {
      this.context.emit("error", `Failed to initialize GuardianSystem: ${error}`);
      throw error;
    }
  }

  /**
   * Called when the plugin is unloaded
   */
  async onUnload(): Promise<void> {
    if (this.isRunning) {
      await this.stop();
    }
  }

  /**
   * Starts the Minecraft server
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.context.emit("log", {
      message: "Starting Minecraft server via GuardianPlugin...",
      level: "info",
    });

    try {
      // Setup environment if needed
      await this.system.setup();

      // Start the system
      await this.system.start();
      this.isRunning = true;

      this.context.emit("status", "running");
    } catch (error) {
      this.context.emit("error", `Error starting server: ${error}`);
      throw error;
    }
  }

  /**
   * Stops the Minecraft server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.context.emit("log", {
      message: "Stopping Minecraft server via GuardianPlugin...",
      level: "info",
    });

    try {
      await this.system.stop();
      this.isRunning = false;
      this.context.emit("status", "stopped");
    } catch (error) {
      this.context.emit("error", `Error stopping server: ${error}`);
      throw error;
    }
  }

  /**
   * Exposes the underlying system for direct manipulation if needed
   */
  getSystem(): GuardianSystem {
    return this.system;
  }
}
