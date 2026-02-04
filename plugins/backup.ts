import { CronJob } from "cron";
import path from "node:path";
import { readdir, unlink, stat } from "node:fs/promises";
import { 
  z, 
  type IPlugin, 
  type PluginContext, 
  PluginPermission 
} from "bun_plugins"; // Ajusta la ruta a tus tipos

/**
 * Esquema de configuración usando Zod
 * Esto permite que el Manager valide la config antes de cargar el plugin
 */
const BackupConfigSchema = z.object({
  cronSchedule: z.string().default("0 0 4 * * *"),
  backupPath: z.string().default("./backups"),
  maxBackupsToKeep: z.number().int().min(1).default(5),
  timeZone: z.string().default("America/Lima"),
  compressionLevel: z.number().int().min(1).max(12).default(6),
  // Carpeta a respaldar (generalmente la raíz del servidor)
  sourcePath: z.string().default("./")
});

type BackupConfig = z.infer<typeof BackupConfigSchema>;

export class BackupPlugin implements IPlugin {
  name = "GuardianBackup";
  version = "4.0.0";
  description = "Sistema de respaldos automáticos usando Bun Archive y Cron";
  author = "Guardian Team";
  
  // Definimos que este plugin requiere acceso al sistema de archivos
  permissions = [PluginPermission.Filesystem];
  
  configSchema = BackupConfigSchema;

  private context!: PluginContext;
  private job: CronJob | null = null;
  private isBackingUp = false;

  async onLoad(context: PluginContext): Promise<void> {
    this.context = context;
    const config = this.context.config as BackupConfig;

    try {
      this.job = CronJob.from({
        cronTime: config.cronSchedule,
        onTick: () => this.performBackup(),
        start: true,
        timeZone: config.timeZone,
      });

      const nextDate = this.job.nextDate().toISO();
      this.context.log.info(`Cron activo [${config.cronSchedule}]. Próximo backup: ${nextDate}`);
    } catch (e) {
      this.context.log.error(`Error al inicializar el CronJob: ${e}`);
    }
  }

  async onUnload(): Promise<void> {
    if (this.job) {
      this.job.stop();
      this.context.log.info("Cron de backups detenido.");
    }
  }
  private formatLog(context: PluginContext,command:string){
    context.emit('serverCore:execute',{
        command
    })
  }
  private async performBackup() {
    if (this.isBackingUp) return;

    const config = this.context.config as BackupConfig;
    
    // Intentamos obtener el plugin del servidor para gestionar el estado del mundo
    // Asumiendo que existe un plugin llamado "server-core"
    const serverCore = await this.context.getPlugin("server-core");

    this.isBackingUp = true;

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `backup-${timestamp}.tar.gz`;
      
      const sourceDir = path.resolve(config.sourcePath);
      const backupDir = path.resolve(config.backupPath);
      const fullDestPath = path.join(backupDir, fileName);

      this.context.log.info(`♻️ Iniciando respaldo programado...`);

      // 1. Notificar y Preparar (Si el servidor tiene API expuesta)
      if (this.context) {
        this.formatLog(this.context,"say §e[Guardian] §fIniciando respaldo...");
        this.formatLog(this.context,"save-off");
        this.formatLog(this.context,"save-all flush");
        // Usamos el setTimeout del contexto (registrado para limpieza automática)
        await new Promise(r => this.context.setTimeout(r, 3000));
      }

      // 2. Escaneo de archivos
      const filesToArchive: Record<string, any> = {};
      await this.scanDirectory(sourceDir, sourceDir, backupDir, filesToArchive);

      // 3. Compresión Nativa con Bun.Archive
      const archive = new Bun.Archive(filesToArchive, {
        compress: "gzip",
        level: config.compressionLevel,
      });

      // 4. Escritura
      await Bun.write(fullDestPath, archive);
      
      this.context.log.info(`✅ Backup exitoso: ${fileName}`);

      // 5. Limpieza de antiguos
      await this.pruneOldBackups(backupDir, config.maxBackupsToKeep);

    } catch (error) {
      this.context.log.error(`Error crítico en backup: ${error}`);
      this.context.emit("log", { level: "error", message: `Backup Fallido: ${error}` });
    } finally {
      if (this.context) {
        this.formatLog(this.context,"save-on");
        this.formatLog(this.context,"say §e[Guardian] §fRespaldo finalizado.");
      }
      this.isBackingUp = false;
    }
  }

  private async scanDirectory(
    root: string, 
    current: string, 
    exclude: string, 
    map: Record<string, any>
  ) {
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      
      // No respaldar la carpeta de backups a sí misma
      if (fullPath === exclude) continue;

      const relPath = path.relative(root, fullPath).replace(/\\/g, "/");

      if (entry.isDirectory()) {
        await this.scanDirectory(root, fullPath, exclude, map);
      } else {
        // Usamos el helper de archivos del contexto si existe, 
        // o directamente Bun.file (ya que pedimos permiso de Filesystem)
        map[relPath] = Bun.file(fullPath);
      }
    }
  }

  private async pruneOldBackups(dir: string, keep: number) {
    try {
      const files = await readdir(dir);
      const backups = [];

      for (const f of files) {
        if (f.endsWith(".tar.gz")) {
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
          this.context.log.info(`🗑️ Eliminado backup antiguo: ${old.name}`);
        }
      }
    } catch (e) {
      this.context.log.error(`Error limpiando backups: ${e}`);
    }
  }
}