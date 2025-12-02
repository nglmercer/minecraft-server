import { getOrInstallJava } from "./src/java.service";
import { downloadServer } from "./src/core.service";
import { Guardian } from "./src/guardian";
import { Config } from "./src/Config";
import { BackupPlugin } from "./src/plugins/backup";

async function main() {
  try {
    const config = Config.getInstance();
    config.loadSync();
    const result_java = await getOrInstallJava(23);
    //console.log("result", result);

    if (!result_java) {
      console.error("Failed to get or install Java");
      return null;
    }

    const coreInfo = await downloadServer({
      version: "1.21",
      core: "paper",
      //  filename:
    });

    // Cargar la configuración existente

    // Usar el método público updateServer para actualizar la configuración
    config.updateServer({
      javaBin: result_java.findResult?.javaExecutable!,
      jarPath: coreInfo.path,
    });

    const guardian = new Guardian(config);
    const backupSystem = new BackupPlugin({
      cronSchedule: "0 0 4 * * *",
      backupPath: config.guardian.paths.backups, // Usamos la ruta de tu Config.ts
      maxBackupsToKeep: 5,
    });
    /*
    this.config = {
      // 0 segundos, 0 minutos, 4 horas (4:00:00 AM)
      cronSchedule: config.cronSchedule || "0 0 4 * * *",
      backupPath: config.backupPath || "./backups",
      maxBackupsToKeep: config.maxBackupsToKeep || 5,
      timeZone: config.timeZone || "America/Lima", // Define tu zona horaria explícitamente
    };
    */
    guardian.use(backupSystem);
    // Configurar los manejadores de eventos ANTES de iniciar
    guardian.on("error", (error) => {
      console.error("Guardian error:", error);
    });

    guardian.on("status", (status) => {
      console.log("Guardian status:", status);
    });

    guardian.on("output", (message) => {
      console.log("Server output:", message);
    });

    guardian.on("log", (message) => {
      console.log("Guardian log:", message);
    });

    guardian.on("stopped", (event) => {
      console.log("Guardian stopped:", event.reason);
      if (event.isCrash) {
        console.error("Server crashed with exit code:", event.code);
      }
    });

    // Iniciar el servidor
    await guardian.start();

    // Mantener el proceso vivo para que el servidor continúe ejecutándose
    process.on("SIGINT", async () => {
      console.log("Received SIGINT, stopping server...");
      await guardian.stop();
      process.exit(0);
    });

    return {
      result_java,
      coreInfo,
    };
  } catch (error) {
    console.error("Error in main function:", error);
    return null;
  }
}
main()
  .then((result) => {
    if (result) {
      console.log("Installation completed successfully.");
    } else {
      console.error("Installation failed.");
    }
  })
  .catch((error) => {
    console.error("Installation error:", error);
  });
