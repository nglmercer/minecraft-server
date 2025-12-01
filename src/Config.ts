import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import type { GuardianConfig, ServerConfig } from "./types";

export interface AppConfigData {
  server: ServerConfig;
  guardian: GuardianConfig;
}

export class Config {
  private static instance: Config;
  private data: AppConfigData;
  private configPath: string;
  private configDir: string;

  private constructor(customConfigPath?: string) {
    if (customConfigPath) {
      // Resolve to absolute path to ensure proper directory resolution
      this.configPath = path.resolve(customConfigPath);
      this.configDir = path.dirname(this.configPath);
    } else {
      this.configDir = path.resolve(process.cwd(), "config");
      this.configPath = path.resolve(this.configDir, "config.yaml");
    }
    this.data = this.getDefaults();
  }

  public static getInstance(customConfigPath?: string): Config {
    // Always create a new instance when a custom path is provided
    if (!Config.instance || customConfigPath) {
      Config.instance = new Config(customConfigPath);
    }
    return Config.instance;
  }

  public static resetInstance(): void {
    Config.instance = undefined as any;
  }

  public getDefaults(): AppConfigData {
    const rootDir = process.cwd();
    const dataPath = path.resolve(rootDir, "data");

    return {
      server: {
        jarPath: "server.jar",
        javaBin: "java",
        jvmOptions: ["-Xmx2G", "-Xms2G"],
        programArgs: ["nogui"],
        port: 25565,
        cwd: path.join(dataPath, "server"),
      },
      guardian: {
        autoRestart: true,
        maxRetries: 3,
        retryDelayMs: 5000,
        paths: {
          data: dataPath,
          logs: path.resolve(rootDir, "logs"),
          backups: path.resolve(rootDir, "backups"),
        },
      },
    };
  }

  /**
   * Carga la configuración de forma SÍNCRONA
   */
  public loadSync(): AppConfigData {
    try {
      if (!existsSync(this.configPath)) {
        console.warn("⚠️  Config file not found, creating default structure.");
        this.saveSync();
        return this.data;
      }

      // 1. Leemos el archivo síncronamente
      const content = readFileSync(this.configPath, "utf-8");

      // Handle empty file case
      if (!content.trim()) {
        console.warn("⚠️  Config file is empty, using defaults.");
        return this.data;
      }

      // 2. Parseamos usando Bun.YAML.parse con manejo de errores mejorado
      let parsed: Record<string, any> = {};
      try {
        parsed = Bun.YAML.parse(content) as Record<string, any>;

        // Handle multi-document YAML (Bun returns an array)
        if (Array.isArray(parsed)) {
          // Use the first document that contains server or guardian config
          parsed =
            parsed.find((doc) => doc && (doc.server || doc.guardian)) ||
            parsed[0] ||
            {};
        }

        // Ensure we have an object
        if (!parsed || typeof parsed !== "object") {
          console.warn("⚠️  YAML did not parse to an object, using defaults.");
          parsed = {};
        }
      } catch (yamlError) {
        console.error("⚠️  YAML parse error, using defaults:", yamlError);
        console.error(
          "First 100 characters of problematic content:",
          content.substring(0, 100),
        );
        parsed = {};
      }

      // 3. Merge profundo con validación de tipos y estructura mejorada
      this.data = this.mergeWithDefaults(parsed);

      return this.data;
    } catch (e) {
      console.error("❌ Error loading config:", e);
      // Create a backup of the corrupted file if it exists
      if (existsSync(this.configPath)) {
        const backupPath = `${this.configPath}.corrupted.${Date.now()}`;
        try {
          const fs = require("fs");
          fs.copyFileSync(this.configPath, backupPath);
          console.error(`🔒 Corrupted config backed up to: ${backupPath}`);
        } catch (backupError) {
          console.error("Failed to create backup:", backupError);
        }
      }
      return this.data;
    }
  }

  /**
   * Realiza un merge profundo seguro con los valores predeterminados
   */
  public mergeWithDefaults(parsed: Partial<AppConfigData> = {}): AppConfigData {
    // Create a deep copy of defaults to avoid mutation
    const result = JSON.parse(JSON.stringify(this.data));

    // Merge server config
    if (parsed.server && typeof parsed.server === "object") {
      result.server = {
        ...result.server,
        ...parsed.server,
        // Ensure array properties are properly merged
        jvmOptions: Array.isArray(parsed.server.jvmOptions)
          ? parsed.server.jvmOptions
          : result.server.jvmOptions,
        programArgs: Array.isArray(parsed.server.programArgs)
          ? parsed.server.programArgs
          : result.server.programArgs,
      };
    }

    // Merge guardian config
    if (parsed.guardian && typeof parsed.guardian === "object") {
      result.guardian = {
        ...result.guardian,
        ...parsed.guardian,
      };

      // Merge guardian paths
      if (parsed.guardian.paths && typeof parsed.guardian.paths === "object") {
        result.guardian.paths = {
          ...result.guardian.paths,
          ...parsed.guardian.paths,
        };
      }
    }

    return result;
  }

  /**
   * Guarda la configuración de forma SÍNCRONA
   */
  public saveSync(): void {
    this.ensureDirectoriesSync();

    // Convertir a YAML
    const yamlContent = this.toYAML(this.data);

    writeFileSync(this.configPath, yamlContent, "utf-8");
    //console.log(`✅ Configuration saved to ${this.configPath}`);
  }

  /**
   * Crea las carpetas necesarias de forma síncrona
   */
  private ensureDirectoriesSync(): void {
    // Config dir
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }

    // Server cwd
    if (this.data.server.cwd && !existsSync(this.data.server.cwd)) {
      // Only create directories if they're under the project root to avoid permission issues
      const projectRoot = path.resolve(process.cwd());

      let resolvedCwd;

      try {
        resolvedCwd = path.resolve(this.data.server.cwd);
      } catch (error) {
        console.warn(`⚠️  Could not resolve path: ${this.data.server.cwd}`);
        return; // Skip directory creation if path resolution fails
      }

      if (resolvedCwd.startsWith(projectRoot)) {
        try {
          mkdirSync(this.data.server.cwd, { recursive: true });
        } catch (error) {
          console.warn(
            `⚠️  Failed to create directory: ${this.data.server.cwd}`,
            error,
          );
        }
      } else {
        console.warn(
          `⚠️  Skipping directory creation for path outside project: ${this.data.server.cwd}`,
        );
      }
    }

    // Guardian paths
    const { data, logs, backups } = this.data.guardian.paths;
    const projectRoot = path.resolve(process.cwd());

    [data, logs, backups].forEach((dir) => {
      if (!existsSync(dir)) {
        let resolvedDir;

        try {
          resolvedDir = path.resolve(dir);
        } catch (error) {
          console.warn(`⚠️  Could not resolve path: ${dir}`);
          return; // Skip this directory if path resolution fails
        }

        // Only create directories if they're under the project root to avoid permission issues
        if (resolvedDir.startsWith(projectRoot)) {
          try {
            mkdirSync(dir, { recursive: true });
          } catch (error) {
            console.warn(`⚠️  Failed to create directory: ${dir}`, error);
          }
        } else {
          console.warn(
            `⚠️  Skipping directory creation for path outside project: ${dir}`,
          );
        }
      }
    });
  }

  /**
   * Convierte el objeto a YAML string con formato legible
   */
  private toYAML(data: AppConfigData): string {
    // Usar Bun.YAML.stringify para generar YAML válido
    const compactYaml = Bun.YAML.stringify(data);

    // Formatear para hacerlo más legible
    return `# Guardian Server Configuration
# Generated by Guardian Server Manager

${this.formatYaml(compactYaml)}`;
  }

  /**
   * Formatea el YAML compacto para hacerlo más legible
   */
  private formatYaml(compactYaml: string): string {
    // Convertir el YAML compacto a objeto
    const parsed = Bun.YAML.parse(compactYaml) as AppConfigData;

    // Formatear manualmente para mejor legibilidad
    let result = "server:\n";
    result += `  jarPath: "${this.escapeYamlValue(parsed.server.jarPath)}"\n`;
    result += `  javaBin: "${this.escapeYamlValue(parsed.server.javaBin)}"\n`;
    result += "  jvmOptions:\n";
    for (const opt of parsed.server.jvmOptions) {
      result += `    - "${this.escapeYamlValue(opt)}"\n`;
    }
    result += "  programArgs:\n";
    for (const arg of parsed.server.programArgs) {
      result += `    - "${this.escapeYamlValue(arg)}"\n`;
    }
    result += `  port: ${parsed.server.port}\n`;
    result += `  cwd: "${this.escapeYamlValue(parsed.server.cwd)}"\n`;

    result += "\nguardian:\n";
    result += `  autoRestart: ${parsed.guardian.autoRestart}\n`;
    result += `  maxRetries: ${parsed.guardian.maxRetries}\n`;
    result += `  retryDelayMs: ${parsed.guardian.retryDelayMs}\n`;
    result += "  paths:\n";
    result += `    data: "${this.escapeYamlValue(parsed.guardian.paths.data)}"\n`;
    result += `    logs: "${this.escapeYamlValue(parsed.guardian.paths.logs)}"\n`;
    result += `    backups: "${this.escapeYamlValue(parsed.guardian.paths.backups)}"\n`;

    return result;
  }

  /**
   * Escapa los valores para asegurar que sean válidos en YAML
   */
  private escapeYamlValue(value: string): string {
    // Escapar comillas y caracteres especiales
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  // Getters
  get server(): ServerConfig {
    return this.data.server;
  }

  get guardian(): GuardianConfig {
    return this.data.guardian;
  }

  get paths() {
    return this.data.guardian.paths;
  }

  // Setters / Updates
  public updateServer(updates: Partial<ServerConfig>): void {
    this.data.server = { ...this.data.server, ...updates };
    this.saveSync();
  }

  public updateGuardian(updates: Partial<GuardianConfig>): void {
    this.data.guardian = { ...this.data.guardian, ...updates };
    this.saveSync();
  }
}
