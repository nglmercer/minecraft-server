// extra/tunnel/index.ts
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

    return binarymanager.getDefaultBinaryPath()!;
  } catch (error) {
    console.error({ error });
    throw error;
  }
}

async function startTunnel(): Promise<void> {
  const binaryPath = await installPlayitBinary();
  const TUNNEL_CONFIG: tunnelConfig = {
    port: 25565,
    binaryPath,
    dataDir: CONFIG.dataDir,
  };
  // Build arguments for playit
  const args = [`--relay-tcp-port:${TUNNEL_CONFIG.port}`, "--master"];

  // Create tunnel configuration
  const tunnelConfig = {
    ...TUNNEL_CONFIG,
    binaryPath,
    args,
    dataDir: TUNNEL_CONFIG.dataDir,
    timeoutMs: 30000,
  };

  // Create and start tunnel manager
  const manager = new TunnelManager(tunnelConfig);

  try {
    const result = await manager.start();

    if (result) {
      console.log(manager.getConfig());

      // Try to extract share URL from output
      const shareUrl = extractShareUrl(
        manager.getProcess()?.stdout?.toString() || "",
      );
      if (shareUrl) {
        console.log(`Share URL: ${shareUrl}`);
      }
      await waitForInterrupt();
      await manager.stop();
    }
  } catch (error) {
    console.error({ error });
    throw error;
  }
}

function extractShareUrl(output?: string): string | null {
  if (!output) return null;

  // Look for playit.gg URLs
  const patterns = [
    /https:\/\/[a-z0-9-]+\.playit\.gg/gi,
    /playit\.gg\/share\/[a-zA-Z0-9-]+/gi,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match && match[0]) return match[0]; // Use first match
  }

  return null;
}

function waitForInterrupt(): Promise<void> {
  return new Promise((resolve) => {
    process.on("SIGINT", () => resolve());
  });
}

async function main() {
  try {
    console.log("Starting tunnel...");
    await startTunnel();
  } catch (error) {
    console.error({ error });
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
