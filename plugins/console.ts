import { createInterface, type Interface } from "node:readline";
import { type IPlugin, type PluginContext, type AppEvents } from "bun_plugins";

/**
 * Extended AppEvents interface for Minecraft-specific events
 * Uses Omit to override the log property to accept both string and structured formats
 */
interface MinecraftAppEvents extends Omit<AppEvents, 'log'> {
  log: string | { level: "info" | "error" | "warn"; message: string };
  "server:write": string;
}

/**
 * Extended PluginContext interface for Minecraft server integration
 * Adds the write method to send commands to the Minecraft server
 */
interface MinecraftPluginContext extends Omit<PluginContext, 'emit' | 'on'> {
  write?(command: string): void;
  emit<K extends keyof MinecraftAppEvents>(event: K, payload: MinecraftAppEvents[K]): void;
  on<K extends keyof MinecraftAppEvents>(event: K, callback: (payload: MinecraftAppEvents[K]) => void): void;
}

/**
 * Plugin that provides an interactive console for the Minecraft server.
 * Allows typing commands directly into the terminal and receiving server output.
 */
export class ConsolePlugin implements IPlugin {
  name = "console-input";
  version = "1.1.0";
  description = "Allows sending commands to the Minecraft server from the terminal";
  author = "Guardian Team";

  private context!: MinecraftPluginContext;
  private rl: Interface | null = null;
  private isEnabled = false;

  onLoad(context: PluginContext): void {
    this.context = context;
    this.setupReadline();
    this.isEnabled = true;
    
    // Optional: Log that console input is active
    this.context.emit("log", "Console input plugin active. Type commands below.");
  }

  onUnload(): void {
    this.isEnabled = false;
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }

  private setupReadline(): void {
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      prompt: "", // We don't use a prompt to avoid cluttering with server logs
    });

    this.rl.on("line", (line: string) => {
      const command = line.trim();
      if (command && this.isEnabled) {
        // Send to server via event or direct write if available
        if (this.context.write) {
          this.context.write(command);
        } else {
          this.context.emit("server:write", command);
        }
      }
    });

    // Handle process interruption to cleanly close readline
    process.on("SIGINT", () => {
      if (this.rl) {
        this.rl.close();
      }
    });
  }
}
