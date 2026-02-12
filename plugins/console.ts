import { createInterface } from "node:readline";
import { type IPlugin, type PluginContext } from "bun_plugins";

/**
 * Plugin that provides an interactive console for the Minecraft server.
 * Allows typing commands directly into the terminal and receiving server output.
 */
export class ConsolePlugin implements IPlugin {
  name = "console-input";
  version = "1.1.0";
  description = "Allows sending commands to the Minecraft server from the terminal";
  author = "Guardian Team";

  private context!: any;
  private rl: any;
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
        if (typeof (this.context as any).write === "function") {
          (this.context as any).write(command);
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
