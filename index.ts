//index.ts
import { getOrInstallJava } from "./src/java.service";
import { downloadServer } from "./src/core.service";
import { Guardian } from "./src/guardian";
import { Config } from "./src/Config";
import { BackupPlugin } from "./src/plugins/backup";
import { type ServerCore } from "minecraft-core";
import { BasePluginManager } from "./src/plugins/index";

async function main() {
  try {
    const manager = new BasePluginManager()
    await manager.loadDefaultPlugins();
    console.log(manager.listPlugins());
    // Paso 1: Cargar configuración desde archivos YAML
    // La configuración incluye: versiones de Java/core, rutas, puertos, etc.
    const config = Config.getInstance();
    await config.load();
    // Paso 2: Verificar/instalar Java con la versión especificada en config
    // Si Java no está instalado, se descarga e instala automáticamente
    const result_java = await getOrInstallJava(config.server.javaVersion);
    
    // Validar que Java esté disponible
    if (!result_java) {
      console.error("❌ Failed to get or install Java");
      return null;
    }

    // Paso 3: Descargar el núcleo del servidor (Paper, Spigot, etc.)
    // Se descarga según la versión y tipo especificados en la configuración
    const coreInfo = await downloadServer({
      version: config.server.coreVersion,
      core: config.server.core as ServerCore,
      // filename: se puede especificar un nombre personalizado para el JAR
    });

    // Paso 4: Actualizar la configuración con las rutas descubiertas
    // Se actualizan las rutas de Java y el JAR del servidor
    config.updateServer({
      javaBin: result_java.findResult?.javaExecutable!,
      jarPath: coreInfo.path,
    });

    // Paso 5: Inicializar el sistema Guardian con plugins
    // Guardian gestiona el ciclo de vida del servidor Minecraft
    const guardian = new Guardian(config);
    
    // Configurar el plugin de respaldos automáticos
    // Se ejecuta diariamente a las 4:00 AM y mantiene los últimos 5 respaldos
    const backupSystem = new BackupPlugin({
      cronSchedule: "0 0 4 * * *", // 4:00 AM diariamente
      backupPath: config.guardian.paths.backups, // Ruta desde Config.ts
      maxBackupsToKeep: 5, // Mantener máximo 5 respaldos
    });
    
    // Nota: Configuración alternativa comentada
    /*
    this.config = {
      // 0 segundos, 0 minutos, 4 horas (4:00:00 AM)
      cronSchedule: config.cronSchedule || "0 0 4 * * *",
      backupPath: config.backupPath || "./backups",
      maxBackupsToKeep: config.maxBackupsToKeep || 5,
      timeZone: config.timeZone || "America/Lima", // Define tu zona horaria explícitamente
    };
    */
    
    // Registrar el plugin de respaldos en el sistema Guardian
    guardian.use(backupSystem);

    // Paso 6: Configurar manejadores de eventos ANTES de iniciar
    // Estos eventos proporcionan información sobre el estado del servidor
    
    /** Manejador de errores críticos del Guardian */
    guardian.on("error", (error) => {
      console.error("❌ Guardian error:", error);
    });

    /** Manejador de cambios de estado del servidor */
    guardian.on("status", (status) => {
      console.log("📊 Guardian status:", status);
    });

    /** Manejador de salida del servidor (logs del juego) */
    guardian.on("output", (message) => {
      console.log("log:",message);
    });

    /** Manejador de logs internos del Guardian */
    guardian.on("log", (message) => {
      console.log("📝 Guardian log:", message);
    });

    /** Manejador de detención del servidor (normal o por crash) */
    guardian.on("stopped", (event) => {
      console.log("⏹️  Guardian stopped:", event.reason);
      if (event.isCrash) {
        console.error("💥 Server crashed with exit code:", event.code);
      }
    });

    // Paso 7: Iniciar el servidor Minecraft
    await guardian.start();

    // Paso 8: Configurar manejo de señales del sistema
    // Captura SIGINT (Ctrl+C) para apagar el servidor gracefulmente
    process.on("SIGINT", async () => {
      console.log("⚠️  Received SIGINT, stopping server...");
      await guardian.stop();
      process.exit(0);
    });

    // Retornar información de la instalación exitosa
    return {
      result_java,
      coreInfo,
    };
  } catch (error) {
    console.error("💥 Error in main function:", error);
    return null;
  }
}

/**
 * Punto de entrada de la aplicación
 *
 * @description
 * Ejecuta la función main() y maneja los resultados:
 * - Si result existe: instalación e inicio exitosos
 * - Si result es null: falló la instalación/inicio
 * - Si hay excepción: error crítico durante la ejecución
 *
 * El proceso se mantiene vivo hasta que se reciba SIGINT (Ctrl+C)
 */
main()
  .then((result) => {
      if (result) {
        console.log(" Ctrl+C to close");
      } else {
        console.error("error.",result);
        process.exit(1);
      }
  })
  .catch((error) => {
    console.error("error:", error);
    process.exit(1);
  });
