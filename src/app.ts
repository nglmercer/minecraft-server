import { Config } from "./Config";
import { Guardian } from "./guardian";
import { EventEmitter } from "node:events";

/**
 * Clase base para todos los plugins del sistema
 * Proporciona acceso común a la configuración y al Guardian
 */
export abstract class BasePlugin extends EventEmitter {
  protected config: Config;
  protected guardian: Guardian;

  constructor() {
    super();
    this.config = Config.getInstance();
    this.guardian = new Guardian();
  }
  onAny(listener: (...args: any[]) => void): this {
    return this.on("any", listener);
  }
  /**
   * Inicializa el plugin
   * @returns true si la inicialización fue exitosa
   */
  async initialize(): Promise<boolean> {
    try {
      this.config.loadSync();
      this.setupGuardianEvents();
      this.setupPluginEvents();
      return true;
    } catch (error) {
      console.error(`Failed to initialize ${this.constructor.name}:`, error);
      return false;
    }
  }

  /**
   * Establece los eventos del Guardian que todos los plugins pueden necesitar
   */
  protected setupGuardianEvents(): void {
    this.guardian.on("status", (status: string) => {
      this.emit("serverStatus", status);
    });

    this.guardian.on("output", (line: string) => {
      this.emit("serverOutput", line);
    });

    this.guardian.on("stopped", (event: any) => {
      this.emit("serverStopped", event);
    });

    this.guardian.on("pid", (pid: number) => {
      this.emit("serverPid", pid);
    });
  }

  /**
   * Método para que las clases hijas implementen sus propios eventos
   */
  protected abstract setupPluginEvents(): void;

  /**
   * Inicia el plugin
   * Cada plugin debe implementar su propia lógica de inicio
   */
  abstract start(): Promise<boolean>;

  /**
   * Detiene el plugin
   * Cada plugin debe implementar su propia lógica de detención
   */
  abstract stop(): Promise<boolean>;

  /**
   * Reinicia el plugin
   */
  async restart(): Promise<boolean> {
    await this.stop();
    return this.start();
  }

  /**
   * Inicia el servidor de Minecraft a través del Guardian
   */
  async startMinecraftServer(): Promise<void> {
    await this.guardian.start();
  }

  /**
   * Detiene el servidor de Minecraft a través del Guardian
   */
  async stopMinecraftServer(): Promise<void> {
    await this.guardian.stop();
  }

  /**
   * Envía un comando al servidor de Minecraft
   * @param command Comando a enviar
   */
  sendMinecraftCommand(command: string): void {
    this.guardian.write(command);
  }

  /**
   * Obtiene el estado actual del servidor de Minecraft
   */
  getMinecraftServerStatus(): string {
    return this.guardian.status;
  }

  /**
   * Obtiene la configuración actual
   */
  getConfig(): Config {
    return this.config;
  }
}

/**
 * Aplicación principal que gestiona los plugins
 */
export class App extends EventEmitter {
  private plugins: Map<string, BasePlugin> = new Map();
  private static instance: App;

  private constructor() {
    super();
  }

  /**
   * Obtiene la instancia singleton de la aplicación
   */
  public static getInstance(): App {
    if (!App.instance) {
      App.instance = new App();
    }
    return App.instance;
  }

  /**
   * Registra un plugin en la aplicación
   * @param name Nombre del plugin
   * @param plugin Instancia del plugin
   */
  registerPlugin(name: string, plugin: BasePlugin): void {
    if (this.plugins.has(name)) {
      throw new Error(`Plugin ${name} is already registered`);
    }

    this.plugins.set(name, plugin);
    this.emit("pluginRegistered", { name, plugin });

    // Reemitir eventos del plugin
    plugin.onAny((eventName: string, ...args: any[]) => {
      this.emit(`plugin:${name}:${eventName}`, ...args);
    });
  }

  /**
   * Inicializa todos los plugins registrados
   */
  async initializePlugins(): Promise<boolean> {
    let allSuccessful = true;

    for (const [name, plugin] of this.plugins) {
      try {
        const success = await plugin.initialize();
        if (success) {
          console.log(`Plugin ${name} initialized successfully`);
        } else {
          console.error(`Failed to initialize plugin ${name}`);
          allSuccessful = false;
        }
      } catch (error) {
        console.error(`Error initializing plugin ${name}:`, error);
        allSuccessful = false;
      }
    }

    return allSuccessful;
  }

  /**
   * Inicia todos los plugins registrados
   */
  async startPlugins(): Promise<boolean> {
    let allSuccessful = true;

    for (const [name, plugin] of this.plugins) {
      try {
        const success = await plugin.start();
        if (success) {
          console.log(`Plugin ${name} started successfully`);
        } else {
          console.error(`Failed to start plugin ${name}`);
          allSuccessful = false;
        }
      } catch (error) {
        console.error(`Error starting plugin ${name}:`, error);
        allSuccessful = false;
      }
    }

    return allSuccessful;
  }

  /**
   * Detiene todos los plugins registrados
   */
  async stopPlugins(): Promise<boolean> {
    let allSuccessful = true;

    for (const [name, plugin] of this.plugins) {
      try {
        const success = await plugin.stop();
        if (success) {
          console.log(`Plugin ${name} stopped successfully`);
        } else {
          console.error(`Failed to stop plugin ${name}`);
          allSuccessful = false;
        }
      } catch (error) {
        console.error(`Error stopping plugin ${name}:`, error);
        allSuccessful = false;
      }
    }

    return allSuccessful;
  }

  /**
   * Obtiene un plugin por su nombre
   * @param name Nombre del plugin
   */
  getPlugin(name: string): BasePlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Lista todos los plugins registrados
   */
  listPlugins(): string[] {
    return Array.from(this.plugins.keys());
  }
}

// Exportar la instancia singleton de la aplicación
export const app = App.getInstance();
