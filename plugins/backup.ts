import path from "node:path";
import { readdir, unlink, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { z, type IPlugin, type PluginContext, type AppEvents } from "bun_plugins";
import { Cron } from "croner";
import {
  MinecraftCommands,
  FileExtensions,
  ConfigConstants,
  Timeouts,
} from "../src/constants";

/**
 * Constants specific to the backup plugin
 */
const BackupConstants = {
  NAME: "GuardianBackup",
  VERSION: "4.1.0",
  DESCRIPTION: "Sistema de respaldos automáticos usando Bun Archive y Croner",
  AUTHOR: "Guardian Team",
  
  // Default configuration values
  DEFAULTS: {
    CRON_SCHEDULE: "0 0 4 * * *", // 4:00 AM daily
    BACKUP_PATH: "./backups",
    MAX_BACKUPS: 5,
    COMPRESSION_LEVEL: 6,
    SOURCE_PATH: "./data/server",
  } as const,
  
  // File patterns
  BACKUP_PREFIX: "backup-",
  
  // Log messages
  LOGS: {
    CRON_ACTIVE: "Cron activo [{schedule}]. Próximo backup: {date}",
    CRON_ERROR: "Error al inicializar Croner: {error}",
    BACKUP_START: "♻️ Iniciando respaldo programado...",
    BACKUP_SUCCESS: "✅ Backup exitoso: {fileName}",
    BACKUP_ERROR: "Error crítico en backup: {error}",
    BACKUP_FAILED: "Backup Fallido: {error}",
    CLEANUP_ERROR: "Error limpiando backups: {error}",
    BACKUP_DELETED: "🗑️ Eliminado backup antiguo: {name}",
    CRON_STOPPED: "Cron de backups detenido.",
  } as const,
} as const;

/**
 * Minecraft server commands used by this plugin
 */
const BackupMinecraftCommands = {
  SAY_BACKUP_START: "say §e[Guardian] §fIniciando respaldo...",
  SAY_BACKUP_END: "say §e[Guardian] §fRespaldo finalizado.",
} as const;

/**
 * Extended AppEvents interface for Minecraft-specific events
 */
interface MinecraftAppEvents extends Omit<AppEvents, 'log'> {
  log: string | { level: "info" | "error" | "warn"; message: string };
  "server:write": string;
  error: string;
  output: string;
}

/**
 * Extended PluginContext interface for Minecraft server integration
 */
interface MinecraftPluginContext extends Omit<PluginContext, 'emit' | 'on'> {
  emit<K extends keyof MinecraftAppEvents>(event: K, payload: MinecraftAppEvents[K]): void;
  on<K extends keyof MinecraftAppEvents>(event: K, callback: (payload: MinecraftAppEvents[K]) => void): void;
}

/**
 * Esquema de configuración usando Zod
 */
const BackupConfigSchema = z.object({
  cronSchedule: z.string().default(BackupConstants.DEFAULTS.CRON_SCHEDULE),
  backupPath: z.string().default(BackupConstants.DEFAULTS.BACKUP_PATH),
  maxBackupsToKeep: z.number().int().min(1).default(BackupConstants.DEFAULTS.MAX_BACKUPS),
  compressionLevel: z.number().int().min(1).max(12).default(BackupConstants.DEFAULTS.COMPRESSION_LEVEL),
  sourcePath: z.string().default(BackupConstants.DEFAULTS.SOURCE_PATH)
});

type BackupConfig = z.infer<typeof BackupConfigSchema>;

export class BackupPlugin implements IPlugin {
  name = BackupConstants.NAME;
  version = BackupConstants.VERSION;
  description = BackupConstants.DESCRIPTION;
  author = BackupConstants.AUTHOR;
  defaultConfig?: BackupConfig;
  private context!: MinecraftPluginContext;
  private config!: BackupConfig;
  private job: Cron | null = null;
  private isBackingUp = false;

  async onLoad(context: PluginContext): Promise<void> {
    this.context = context as MinecraftPluginContext;    
    await this.loadConfig(context);
    this.setupCron();

    // Permitir disparar backups manualmente vía eventos
    this.context.on("backup:create" as any, () => {
      this.performBackup().catch(err => {
        this.context.emit("error", `Manual backup failed: ${err}`);
      });
    });
  }

  onUnload(): void {
    if (this.job) {
      this.job.stop();
      this.context.emit("log", BackupConstants.LOGS.CRON_STOPPED);
    }
  }

  private async loadConfig(context: PluginContext): Promise<void> {
    const { storage } = context;
    this.defaultConfig = await storage.get("backupConfig") as BackupConfig | undefined;
    const defaultConfig = {
      cronSchedule: BackupConstants.DEFAULTS.CRON_SCHEDULE,
      backupPath: BackupConstants.DEFAULTS.BACKUP_PATH,
      maxBackupsToKeep: BackupConstants.DEFAULTS.MAX_BACKUPS,
      compressionLevel: BackupConstants.DEFAULTS.COMPRESSION_LEVEL,
      sourcePath: BackupConstants.DEFAULTS.SOURCE_PATH,
    };
    if (!this.defaultConfig) {
      await storage.set("backupConfig", BackupConfigSchema.parse(defaultConfig));
    }
    const config = await storage.get("backupConfig") || defaultConfig;
    this.config = BackupConfigSchema.parse(config);


  }

  private setupCron(): void {
    try {
      // Usar croner para programar los respaldos
      this.job = new Cron(this.config.cronSchedule, () => {
        this.performBackup();
      });
      
      const nextDate = this.job.nextRun();
      const nextDateStr = nextDate ? nextDate.toISOString() : "Unknown";
      
      this.context.emit("log", `Cron activo [${this.config.cronSchedule}]. Próximo backup: ${nextDateStr}`);
    } catch (e) {
      this.context.emit("error", `Error al inicializar Croner: ${e}`);
    }
  }

  private async performBackup(): Promise<void> {
    if (this.isBackingUp) return;
    this.isBackingUp = true;

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `${BackupConstants.BACKUP_PREFIX}${timestamp}${FileExtensions.TAR_GZ}`;
      
      const sourceDir = path.resolve(this.config.sourcePath);
      const backupDir = path.resolve(this.config.backupPath);
      const fullDestPath = path.join(backupDir, fileName);

      this.context.emit("log", BackupConstants.LOGS.BACKUP_START);

      // Notify and prepare
      this.context.emit("log", BackupMinecraftCommands.SAY_BACKUP_START);
      this.context.emit("server:write", MinecraftCommands.SAVE_OFF);
      this.context.emit("server:write", MinecraftCommands.SAVE_ALL_FLUSH);
      await new Promise(resolve => setTimeout(resolve, Timeouts.BACKUP_SAVE_DELAY));

      // Scan files
      const filesToArchive: Record<string, any> = {};
      await this.scanDirectory(sourceDir, sourceDir, backupDir, filesToArchive);

      // Compress
      const archive = new Bun.Archive(filesToArchive, {
        compress: "gzip",
        level: this.config.compressionLevel,
      });

      // Write
      await Bun.write(fullDestPath, archive);
      
      this.context.emit("log", 
        BackupConstants.LOGS.BACKUP_SUCCESS.replace("{fileName}", fileName)
      );

      // Cleanup old backups
      await this.pruneOldBackups(backupDir, this.config.maxBackupsToKeep);

    } catch (error) {
      this.context.emit("error", 
        BackupConstants.LOGS.BACKUP_ERROR.replace("{error}", String(error))
      );
      this.context.emit("log", { 
        level: "error", 
        message: BackupConstants.LOGS.BACKUP_FAILED.replace("{error}", String(error)) 
      });
    } finally {
      // Re-enable auto-saving
      this.context.emit("server:write", MinecraftCommands.SAVE_ON);
      this.context.emit("log", BackupMinecraftCommands.SAY_BACKUP_END);
      this.isBackingUp = false;
    }
  }

  private async scanDirectory(
    root: string, 
    current: string, 
    exclude: string, 
    map: Record<string, any>
  ): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      
      if (fullPath === exclude) continue;

      const relPath = path.relative(root, fullPath).replace(/\\/g, "/");

      if (entry.isDirectory()) {
        await this.scanDirectory(root, fullPath, exclude, map);
      } else {
        map[relPath] = Bun.file(fullPath);
      }
    }
  }

  private async pruneOldBackups(dir: string, keep: number): Promise<void> {
    try {
      const files = await readdir(dir);
      const backups: { name: string; path: string; time: number }[] = [];

      for (const f of files) {
        if (f.endsWith(FileExtensions.TAR_GZ)) {
          const p = path.join(dir, f);
          const s = await stat(p);
          backups.push({ name: f, path: p, time: s.mtimeMs });
        }
      }

      backups.sort((a, b) => b.time - a.time);

      if (backups.length > keep) {
        const oldOnes = backups.slice(keep);
        for (const old of oldOnes) {
          await unlink(old.path);
          this.context.emit("log", 
            BackupConstants.LOGS.BACKUP_DELETED.replace("{name}", old.name)
          );
        }
      }
    } catch (e) {
      this.context.emit("error", 
        BackupConstants.LOGS.CLEANUP_ERROR.replace("{error}", String(e))
      );
    }
  }
}
