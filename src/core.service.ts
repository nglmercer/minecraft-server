import {
  MinecraftServerManager,
  NodeAdapter,
  type DownloadOptions,
  type ServerCore,
} from "minecraft-core";
import { FileUtils } from "java-path";
import path from "path";
import { Config } from "./Config";
const manager = new MinecraftServerManager(new NodeAdapter());
export async function downloadServer(_options?: Partial<DownloadOptions>) {
  const configData = Config.getInstance().loadSync();
  const defaultOptions = {
    core: "paper" as ServerCore,
    version: "1.21",
    outputDir: configData.server.cwd,
    filename: "server.jar",
  };
  const options = { ...defaultOptions, ..._options };
  const corePath = path.join(options.outputDir, options.filename);
  const result = await manager.downloadServer(options);

  return result;
}
