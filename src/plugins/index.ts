import { PluginManager } from "bun_plugins";
import { ActionRegistry, RuleEngine } from "trigger_system/node";
import { join } from "node:path";
import { ActionRegistryPlugin } from "./register";
import { ensureDir } from "../utils/filepath";
/**
 * Custom plugin manager for Minecraft Server
 * Extends PluginManager to ensure the ActionRegistryPlugin is always loaded
 */
export class BasePluginManager extends PluginManager {
  public engine: RuleEngine;

  constructor() {
    super();
    // Inicializar el motor de reglas
    this.engine = new RuleEngine({ rules: [], globalSettings: { debugMode: true } });
    
    // Registrar los plugins core automáticamente
    this.register(new ActionRegistryPlugin());
    console.log("ActionRegistryPlugin");
  }

  /**
   * Carga plugins desde el directorio configurado por defecto
   */
  async loadDefaultPlugins() {
    const pluginsDir = join(process.cwd(), "plugins");
    await ensureDir(pluginsDir);
    await this.loadPluginsFromDirectory(pluginsDir);
    return this.listPlugins();
  }
}