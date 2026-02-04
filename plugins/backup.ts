import { CronJob } from "cron";
import path from "node:path";
import { readdir, unlink, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { z, type IPlugin, type PluginContext, type AppEvents } from "bun_plugins";
import {
  BackupPlugin as BackupConstants,
  MinecraftCommands,
  FileExtensions,
  EventNames,
  BackupPaths,
  ConfigConstants,
  Timeouts,
} from "../src/constants";

/**
 * Extended AppEvents interface for Minecraft-specific events
 * Uses Omit to override the log property to accept both string and structured formats
 */
interface MinecraftAppEvents extends Omit<AppEvents, 'log'> {
  log: string | { level: "info" | "error" | "warn"; message: string };
  error: string;
  output: string;
}

/**
 * Extended PluginContext interface for Minecraft server integration
 * Adds the write method to send commands to the Minecraft server
 */
interface MinecraftPluginContext extends Omit<PluginContext, 'emit' | 'on'> {
  write(command: string): void;
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
  timeZone: z.string().default(BackupConstants.DEFAULTS.TIME_ZONE),
  compressionLevel: z.number().int().min(1).max(12).default(BackupConstants.DEFAULTS.COMPRESSION_LEVEL),
  sourcePath: z.string().default(BackupConstants.DEFAULTS.SOURCE_PATH)
});

type BackupConfig = z.infer<typeof BackupConfigSchema>;

export class BackupPlugin implements IPlugin {
  name = BackupConstants.NAME;
  version = BackupConstants.VERSION;
  description = BackupConstants.DESCRIPTION;
  author = BackupConstants.AUTHOR;

  private context!: MinecraftPluginContext;
  private config!: BackupConfig;
  private job: CronJob | null = null;
  private isBackingUp = false;

  onLoad(context: PluginContext): void {
    this.context = context as MinecraftPluginContext;
    this.loadConfig();
    this.setupCron();
  }

  onUnload(): void {
    if (this.job) {
      this.job.stop();
      this.context.emit("log", BackupConstants.LOGS.CRON_STOPPED);
    }
  }

  private loadConfig(): void {
    const configPath = path.join(process.cwd(), BackupPaths.PLUGIN_CONFIG);
    try {
      if (existsSync(configPath)) {
        const content = readFileSync(configPath, ConfigConstants.CHARSET);
        const parsed = Bun.YAML.parse(content) as Record<string, any>;
        this.config = BackupConfigSchema.parse(parsed);
      } else {
        this.config = BackupConfigSchema.parse({});
        // Create default config file
        try {
          const yaml = `${BackupPaths.CONFIG_HEADER}
cronSchedule: ${BackupConstants.DEFAULTS.CRON_SCHEDULE}
backupPath: ${BackupConstants.DEFAULTS.BACKUP_PATH}
maxBackupsToKeep: ${BackupConstants.DEFAULTS.MAX_BACKUPS}
timeZone: ${BackupConstants.DEFAULTS.TIME_ZONE}
compressionLevel: ${BackupConstants.DEFAULTS.COMPRESSION_LEVEL}
sourcePath: ${BackupConstants.DEFAULTS.SOURCE_PATH}
`;
          Bun.write(configPath, yaml);
          this.context.emit("log", `Created default backup config at ${configPath}`);
        } catch (writeErr) {
          // Ignore write errors
        }
      }
    } catch (error) {
      this.context.emit("error", `Failed to load backup config: ${error}. Using defaults.`);
      this.config = BackupConfigSchema.parse({});
    }
  }

  private setupCron(): void {
    try {
      this.job = CronJob.from({
        cronTime: this.config.cronSchedule,
        onTick: () => this.performBackup(),
        start: true,
        timeZone: this.config.timeZone,
      });
      const nextDate = this.job.nextDate();
      const nextDateStr = nextDate ? nextDate.toISO() : "Unknown";
      this.context.emit("log", `Cron activo [${this.config.cronSchedule}]. Próximo backup: ${nextDateStr}`);
    } catch (e) {
      this.context.emit("error", `Error al inicializar el CronJob: ${e}`);
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
      this.context.emit("log", MinecraftCommands.SAY_BACKUP_START);
      this.context.write(MinecraftCommands.SAVE_OFF);
      this.context.write(MinecraftCommands.SAVE_ALL_FLUSH);
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
      this.context.write(MinecraftCommands.SAVE_ON);
      this.context.emit("log", MinecraftCommands.SAY_BACKUP_END);
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
