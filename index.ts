//index.ts
import { getOrInstallJava } from "./src/services/java.service";
import { downloadServer } from "./src/services/core.service";
import { Guardian } from "./src/core/guardian";
import { Config } from "./src/services/config.service";
import { type ServerCore } from "minecraft-core";
import { BasePluginManager } from "./src/plugins/index";
import {
  GuardianEvents,
  GuardianStatus,
  SystemSignals,
  ConsoleMessages,
} from "./src/constants";

async function main() {
  try {
    // Paso 1: Cargar configuración desde archivos YAML
    // La configuración incluye: versiones de Java/core, rutas, puertos, etc.
    // IMPORTANTE: Cargar config ANTES de cargar plugins porque algunos plugins
    // necesitan la configuración disponible en su método onLoad()
    const config = Config.getInstance();
    await config.load();

    // Paso 2: Cargar plugins
    const manager = new BasePluginManager()
    await manager.loadDefaultPlugins();
    // Paso 3: Verificar/instalar Java con la versión especificada en config
    // Si Java no está instalado, se descarga e instala automáticamente
    const result_java = await getOrInstallJava(config.server.javaVersion);
    
    // Validar que Java esté disponible
    if (!result_java) {
      console.error(ConsoleMessages.JAVA_FAILED);
      return null;
    }

    // Paso 4: Descargar el núcleo del servidor (Paper, Spigot, etc.)
    // Se descarga según la versión y tipo especificados en la configuración
    const coreInfo = await downloadServer({
      version: config.server.coreVersion,
      core: config.server.core as ServerCore,
      // filename: se puede especificar un nombre personalizado para el JAR
    });

    // Paso 5: Actualizar la configuración con las rutas descubiertas
    // Se actualizan las rutas de Java y el JAR del servidor
    config.updateServer({
      javaBin: result_java.findResult?.javaExecutable!,
      jarPath: coreInfo.path,
    });

    // Paso 6: Inicializar el sistema
    // Guardian gestiona el ciclo de vida del servidor Minecraft
    const guardian = new Guardian(config,manager);

    // Paso 7: Configurar manejadores de eventos esenciales
    // Los logs generales los maneja el plugin terminal-output
    
    /** Manejador de detención del servidor (normal o por crash) */
    guardian.on(GuardianEvents.STOPPED, (event) => {
      if (event.isCrash) {
        console.error(ConsoleMessages.GUARDIAN_CRASHED, event.code);
      }
    });

    // Paso 8: Iniciar el servidor Minecraft
    await guardian.start();

    // Paso 9: Configurar manejo de señales del sistema
    // Captura SIGINT (Ctrl+C) para apagar el servidor gracefulmente
    process.on(SystemSignals.SIGINT, async () => {
      console.log(ConsoleMessages.GUARDIAN_SIGINT);
      await guardian.stop();
      process.exit(0);
    });

    // Retornar información de la instalación exitosa
    return {
      result_java,
      coreInfo,
    };
  } catch (error) {
    console.error(ConsoleMessages.ERROR_MAIN, error);
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
        console.log(ConsoleMessages.CTRL_C);
      } else {
        console.error(ConsoleMessages.ERROR_GENERIC, result);
        process.exit(1);
      }
    })
  .catch((error) => {
    console.error(ConsoleMessages.ERROR_GENERIC, error);
    process.exit(1);
  });
