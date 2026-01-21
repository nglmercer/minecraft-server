import { BinaryManager, type BinaryManagerConfig } from "./binary-manager";
import { TunnelManager, type tunnelConfig } from "./tunnel-manager";
import path from "path";

const CONFIG: BinaryManagerConfig = {
  dataDir: path.join(process.cwd(), "data", "playit"),
};

async function installPlayitBinary(): Promise<string> {
  const binarymanager = new BinaryManager(CONFIG);
  try {
    const download = await binarymanager.downloadLatestBinary();
    if (download) {
      return download.binaryPath;
    }
    const defaultPath = binarymanager.getDefaultBinaryPath();
    if (!defaultPath)
      throw new Error("No se pudo determinar la ruta del binario");
    return defaultPath;
  } catch (error) {
    console.error({ error });
    throw error;
  }
}

async function startTunnel(): Promise<void> {
  const binaryPath = await installPlayitBinary();

  const tunnelConfig: tunnelConfig = {
    port: 25565,
    binaryPath,
    dataDir: CONFIG.dataDir,
    // Eliminamos 'args' extras y 'token' para forzar el modo normal/interactivo
    token: undefined,
  };

  const manager = new TunnelManager(tunnelConfig);

  // Importante: Esto permite ver el link en la consola
  manager.on("data", (msg) => console.log(msg));
  manager.on("error", (msg) => console.error(msg));

  try {
    // start() esperará hasta que el túnel esté "running" o aparezca el link de setup
    const result = await manager.start();

    if (result) {
      console.log("\n✅ Proceso de Playit iniciado.");
      console.log(
        "ℹ️  Si es la primera vez, usa el link de arriba para vincular.",
      );
      await waitForInterrupt();
      await manager.stop();
    }
  } catch (error) {
    console.error("❌ Error iniciando el túnel:", error);
    process.exit(1);
  }
}

function waitForInterrupt(): Promise<void> {
  return new Promise((resolve) => {
    process.on("SIGINT", () => {
      console.log("\nInterrupción recibida, cerrando...");
      resolve();
    });
  });
}

async function main() {
  await startTunnel();
}

main();
