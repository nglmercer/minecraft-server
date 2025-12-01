import {
  MinecraftServerManager,
  NodeAdapter,
  type DownloadOptions,
  type ServerCore,
} from "minecraft-core";
import { FileUtils } from "java-path";
import path from "path";
import { Config } from "./Config";
import { writeFileSync } from "fs";
const manager = new MinecraftServerManager(new NodeAdapter());
function generateEula(accept = true, customDate = null) {
  const date = customDate || new Date().toUTCString();
  return [
    "#By changing the setting below to TRUE you are indicating your agreement to our EULA (https://aka.ms/MinecraftEULA).",
    `#${date}`,
    `eula=${accept}`,
  ].join("\n");
}
export async function downloadServer(_options?: Partial<DownloadOptions>) {
  const configData = Config.getInstance().loadSync();
  const defaultOptions = {
    core: "paper" as ServerCore,
    version: "1.21",
    outputDir: configData.server.cwd,
  };
  const options = { ...defaultOptions, ..._options };
  const result = await manager.downloadServer(options);

  // Create EULA file automatically
  const eulaPath = path.join(options.outputDir, "eula.txt");
  let eulaContent = generateEula();
  writeFileSync(eulaPath, eulaContent);
  return result;
}
