import * as tar from "tar";
import * as path from "path";
import { mkdir } from "fs/promises";

/**
 * Crea un backup comprimido (gzip) de una carpeta.
 * * @param sourceDir Ruta de la carpeta a respaldar (ej: './data/minecraft-world')
 * @param outPath Ruta completa del archivo resultante (ej: './backups/backup-01.tgz')
 */
export async function backupFolder(
  sourceDir: string,
  outPath: string,
): Promise<void> {
  // Resolvemos rutas absolutas para evitar errores de contexto
  const absoluteSource = path.resolve(sourceDir);
  const parentDir = path.dirname(absoluteSource);
  const folderName = path.basename(absoluteSource);

  // Aseguramos que el directorio donde se guardará el backup exista
  const outputDir = path.dirname(path.resolve(outPath));
  await mkdir(outputDir, { recursive: true });

  console.log(`📦 Iniciando backup de: ${folderName}...`);

  await tar.c(
    {
      gzip: true, // Usa compresión Gzip
      file: outPath,
      cwd: parentDir, // Cambiamos al directorio padre para que el tar contenga solo la carpeta destino
    },
    [folderName],
  );

  console.log(`✅ Backup completado en: ${outPath}`);
}

/**
 * Restaura un backup comprimido en una ruta específica.
 * * @param backupFile Ruta del archivo .tgz o .tar.gz
 * @param destDir Ruta donde se descomprimirá la carpeta
 */
export async function restoreFolder(
  backupFile: string,
  destDir: string,
): Promise<void> {
  const absoluteDest = path.resolve(destDir);

  // Crear directorio destino si no existe
  await mkdir(absoluteDest, { recursive: true });

  console.log(
    `📂 Restaurando ${path.basename(backupFile)} en ${absoluteDest}...`,
  );

  await tar.x({
    file: backupFile,
    cwd: absoluteDest, // Extraer DENTRO de esta carpeta
  });

  console.log(`✅ Restauración completada.`);
}

// --- EJEMPLO DE USO ---
// (Puedes eliminar esto si solo exportas las funciones)
(async () => {
  try {
    const myFolder = "./mi-carpeta-datos";
    const backupLocation = "./backups/archivo-seguro.tgz";
    const restoreLocation = "./restaurado";

    // 1. Crear Backup
    // await backupFolder(myFolder, backupLocation);

    // 2. Restaurar Backup
    // await restoreFolder(backupLocation, restoreLocation);
  } catch (error) {
    console.error("❌ Error en el proceso:", error);
  }
})();
