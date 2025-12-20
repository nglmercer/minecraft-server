/**
 * Minecraft Server Guardian - Main Application Entry Point
 *
 * @fileoverview
 * Este archivo es el punto de entrada principal de la aplicación Minecraft Server Guardian.
 * Se encarga de:
 * - Cargar y validar la configuración del servidor
 * - Instalar/verificar Java requerido
 * - Descargar el núcleo del servidor Minecraft
 * - Inicializar el sistema de guardian con plugins
 * - Configurar manejadores de eventos
 * - Mantener el servidor ejecutándose
 *
 * @author Minecraft Server Guardian Team
 * @version 1.0.0
 */

import { getOrInstallJava } from "./src/java.service";
import { downloadServer } from "./src/core.service";
import { Guardian } from "./src/guardian";
import { Config } from "./src/Config";
import { BackupPlugin } from "./src/plugins/backup";
import { type ServerCore } from "minecraft-core";

/**
 * Función principal que inicia y configura el servidor Minecraft
 *
 * @description
 * Esta función ejecuta el flujo completo de inicialización del servidor:
 * 1. Carga la configuración desde archivos YAML
 * 2. Verifica/instala Java con la versión especificada
 * 3. Descarga el núcleo del servidor (Paper, Spigot, etc.)
 * 4. Actualiza la configuración con rutas de Java y el JAR
 * 5. Inicializa el sistema Guardian con plugins
 * 6. Configura manejadores de eventos
 * 7. Inicia el servidor y mantiene el proceso activo
 *
 * @returns {Promise<{result_java: any, coreInfo: any} | null>}
 *          Objeto con información de Java y el núcleo del servidor, o null si hay error
 *
 * @throws {Error} Lanza error si falla la inicialización crítica
 *
 * @example
 * ```typescript
 * const result = await main();
 * if (result) {
 *   console.log("Servidor iniciado exitosamente");
 * }
 * ```
 */
async function main() {
  try {
    // Paso 1: Cargar configuración desde archivos YAML
    // La configuración incluye: versiones de Java/core, rutas, puertos, etc.
    const config = Config.getInstance();
    config.loadSync();
    
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
      console.log("✅ Installation completed successfully.");
      console.log("🚀 Minecraft server is running...");
      console.log("📍 Press Ctrl+C to stop the server");
    } else {
      console.error("❌ Installation failed.");
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error("💥 Installation error:", error);
    process.exit(1);
  });

/**
 * NOTAS DE IMPLEMENTACIÓN:
 *
 * 1. FLUJO DE INICIALIZACIÓN:
 *    - Config → Java → Core → Guardian → Plugins → Eventos → Start
 *
 * 2. DEPENDENCIAS PRINCIPALES:
 *    - Config: Gestión de configuración YAML
 *    - Java Service: Instalación/verificación de Java
 *    - Core Service: Descarga de núcleos Minecraft
 *    - Guardian: Gestión del ciclo de vida del servidor
 *    - Backup Plugin: Respaldo automático con cron
 *
 * 3. MANEJO DE ERRORES:
 *    - Try/catch en main() para errores críticos
 *    - Eventos de error para problemas en runtime
 *    - Graceful shutdown con SIGINT
 *
 * 4. CONFIGURACIÓN:
 *    - Archivo: config/config.yaml
 *    - Java: versión especificada en config.server.javaVersion
 *    - Core: tipo y versión en config.server.core/config.server.coreVersion
 *    - Backups: diarios a las 4 AM, máximo 5 archivos
 *
 * 5. EVENTOS DISPONIBLES:
 *    - error: errores críticos
 *    - status: cambios de estado
 *    - output: logs del servidor
 *    - log: logs internos
 *    - stopped: servidor detenido
 *
 * 6. EMOJIS UTILIZADOS EN LOGS:
 *    - ✅ Éxito
 *    - ❌ Error
 *    - ⚠️  Advertencia
 *    - 📊 Estado
 *    - 🎮 Servidor
 *    - 📝 Log
 *    - ⏹️  Detenido
 *    - 💥 Crash
 *    - 🚀 Iniciado
 *    - 📍 Instrucción
 */
