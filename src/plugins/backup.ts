import { CronJob } from "cron";
import path from "node:path";
import type { Guardian } from "../guardian";
import type { GuardianPlugin } from "../types";
import { backupFolder } from "../utils/backup-manager"; // Asumiendo que tienes este utilitario

interface BackupConfig {
  cronSchedule: string; // Formato de 6 campos: Seg Min Hor Día Mes DíaSem
  backupPath: string;
  maxBackupsToKeep: number;
  timeZone?: string;
}

export class BackupPlugin implements GuardianPlugin {
  name = "GuardianBackup";
  version = "3.0.0"; // Versión para librería 'cron'

  private guardian: Guardian | null = null;
  private job: CronJob | null = null;
  private isBackingUp = false;
  private config: BackupConfig;

  constructor(config: Partial<BackupConfig> = {}) {
    this.config = {
      // 0 segundos, 0 minutos, 4 horas (4:00:00 AM)
      cronSchedule: config.cronSchedule || "0 0 4 * * *",
      backupPath: config.backupPath || "./backups",
      maxBackupsToKeep: config.maxBackupsToKeep || 5,
      timeZone: config.timeZone || "America/Lima", // Define tu zona horaria explícitamente
    };
  }

  onLoad(guardian: Guardian): void {
    this.guardian = guardian;

    try {
      // Usamos CronJob.from (API moderna de v4)
      this.job = CronJob.from({
        cronTime: this.config.cronSchedule,
        onTick: () => this.performBackup(),
        start: true, // Inicia el trabajo inmediatamente
        timeZone: this.config.timeZone,
        runOnInit: false, // No ejecutar inmediatamente al cargar, esperar al horario
      });

      // Información útil para el log: Cuándo será la próxima ejecución
      const nextDate = this.job.nextDate().toISO();

      this.guardian.emit(
        "log",
        `BackupPlugin: Cron activo [${this.config.cronSchedule}]. Próximo backup: ${nextDate}`,
      );
    } catch (e) {
      this.guardian.emit("error", `Error al configurar CronJob: ${e}`);
    }
  }

  onUnload(): void {
    if (this.job) {
      this.job.stop();
      this.guardian?.emit("log", "BackupPlugin: Cron detenido.");
      this.job = null;
    }
  }

  private async performBackup() {
    if (!this.guardian || this.isBackingUp) return;

    // Verificar estado seguro del servidor
    if (
      this.guardian.status !== "ONLINE" &&
      this.guardian.status !== "OFFLINE"
    ) {
      this.guardian.emit(
        "log",
        "Backup omitido: El servidor está iniciando o deteniéndose.",
      );
      return;
    }

    this.isBackingUp = true;
    const isOnline = this.guardian.status === "ONLINE";

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `backup-${timestamp}.tgz`;

      // --- USO DE TU SELECCIÓN: getConfig() ---
      // Usamos el método público getConfig() que añadiste a Guardian
      // para acceder a la configuración de forma segura y tipada.
      const serverConfig = this.guardian.getConfig().server;

      const sourcePath = path.resolve(serverConfig.cwd);
      const backupDir = path.resolve(this.config.backupPath);
      const fullDestPath = path.join(backupDir, fileName);

      // Verificación de seguridad básica
      if (backupDir.startsWith(sourcePath)) {
        this.guardian.emit(
          "log",
          "⚠️ ADVERTENCIA: La carpeta de backups está dentro del servidor.",
        );
      }

      this.guardian.emit("log", `♻️ Iniciando Backup Automático...`);

      // Fase 1: Guardado en disco (Solo si está online)
      if (isOnline) {
        this.guardian.write(
          "say §e[Guardian] §fIniciando respaldo programado...",
        );
        this.guardian.write("save-off");
        this.guardian.write("save-all flush");
        // Espera de seguridad para escritura en disco
        await new Promise((r) => setTimeout(r, 5000));
      }

      // Fase 2: Compresión
      await backupFolder(sourcePath, fullDestPath);
      this.guardian.emit("log", `✅ Backup exitoso: ${fileName}`);
    } catch (error) {
      this.guardian.emit("error", `❌ Error crítico en backup: ${error}`);
      if (isOnline)
        this.guardian.write("say §c[Guardian] Error en el respaldo.");
    } finally {
      // Fase 3: Restaurar estado del juego
      if (isOnline) {
        this.guardian.write("save-on");
        this.guardian.write("say §e[Guardian] §fRespaldo finalizado.");
      }
      this.isBackingUp = false;
    }
  }
}
