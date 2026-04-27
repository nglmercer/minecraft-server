import { getOrInstallJava } from "../services/java.service";
import { downloadServer } from "../services/core.service";
import { Guardian } from "./guardian";
import { Config } from "../services/config.service";
import { type ServerCore } from "minecraft-core";
import { BasePluginManager } from "../plugins/index";
import {
  GuardianEvents,
  SystemSignals,
  ConsoleMessages,
  ExitCodes,
} from "../constants";
export enum enumMode {
  full,
  setup,
};
export const DEFAULT_MODE = enumMode.full;
/**
 * GuardianSystem
 * 
 * Orchestrates the entire lifecycle of the Guardian application.
 * Handles configuration, plugins, environment setup, and process signals.
 */
export class GuardianSystem {
  private config: Config;
  private pluginManager: BasePluginManager;
  private guardian: Guardian | null = null;
  private isInitialized = false;

  constructor() {
    this.config = Config.getInstance();
    this.pluginManager = new BasePluginManager();
  }

  /**
   * Initializes the system: loads config and plugins
   */
  async init() {
    if (this.isInitialized) return;

    // Step 1: Load configuration
    await this.config.load();

    // Step 2: Load plugins
    await this.pluginManager.loadDefaultPlugins();

    this.isInitialized = true;
  }

  /**
   * Sets up the environment (Java and Server JAR)
   */
  async setup() {
    if (!this.isInitialized) await this.init();

    // Step 3: Verify/install Java
    const result_java = await getOrInstallJava(this.config.server.javaVersion);
    if (!result_java) {
      throw new Error(ConsoleMessages.JAVA_FAILED);
    }

    // Step 4: Download the server core
    const coreInfo = await downloadServer({
      version: this.config.server.coreVersion,
      core: this.config.server.core as ServerCore,
    });

    // Step 5: Update configuration with discovered paths
    this.config.updateServer({
      javaBin: result_java.findResult?.javaExecutable!,
      jarPath: coreInfo.path,
    });

    return { result_java, coreInfo };
  }

  /**
   * Starts the Guardian server manager
   */
  async start() {
    if (!this.isInitialized) await this.init();

    // Step 6: Initialize Guardian
    this.guardian = new Guardian(this.config, this.pluginManager);

    // Step 7: Configure event handlers
    this.guardian.on(GuardianEvents.STOPPED, (event) => {
      if (event.isCrash) {
        console.error(ConsoleMessages.GUARDIAN_CRASHED, event.code);
      }
    });

    // Step 8: Handle system signals for graceful shutdown
    this.setupSignalHandlers();

    // Step 9: Start the Minecraft server
    await this.guardian.start();
  }

  /**
   * Stops the Guardian server manager
   */
  async stop() {
    if (this.guardian) {
      console.log(ConsoleMessages.GUARDIAN_STOPPING);
      await this.guardian.stop();
    }
  }

  /**
   * Runs the complete system flow
   * @param mode 'full' | 'setup'
   * @returns Exit code
   */
  async run(mode: enumMode = DEFAULT_MODE): Promise<number> {
    try {
      await this.init();
      await this.setup();

      if (mode === enumMode.setup) {
        console.log("✅ Environment setup completed successfully.");
        return ExitCodes.SUCCESS;
      }

      await this.start();
      console.log(ConsoleMessages.CTRL_C);

      // In full mode, we wait for a signal or for the guardian to stop
      // Since guardian.start() in Bun usually waits for the process,
      // but here we might want to stay alive if guardian is in background.
      // However, our Guardian class waits for the process to exit.

      return ExitCodes.SUCCESS;
    } catch (error) {
      console.error(ConsoleMessages.ERROR_MAIN, error);
      return 1;
    }
  }

  private setupSignalHandlers() {
    process.on(SystemSignals.SIGINT, async () => {
      console.log(`\n${ConsoleMessages.GUARDIAN_SIGINT}`);
      await this.stop();
      process.exit(ExitCodes.SUCCESS);
    });

    process.on(SystemSignals.SIGTERM, async () => {
      await this.stop();
      process.exit(ExitCodes.SUCCESS);
    });
  }
}
