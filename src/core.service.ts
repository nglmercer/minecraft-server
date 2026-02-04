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
import { CoreService } from "./constants";

const manager = new MinecraftServerManager(new NodeAdapter());

function generateEula(accept = true, customDate = null) {
  const date = customDate || new Date().toUTCString();
  return [
    CoreService.EULA_HEADER,
    `${CoreService.EULA_DATE_PREFIX}${date}`,
    accept ? CoreService.EULA_ACCEPT : CoreService.EULA_DECLINE,
  ].join("\n");
}

export async function downloadServer(_options?: Partial<DownloadOptions>) {
  const configData = Config.getInstance().loadSync();
  const defaultOptions = {
    core: CoreService.DEFAULT_CORE,
    version: CoreService.DEFAULT_CORE_VERSION,
    outputDir: configData.server.cwd,
  };
  const options = { ...defaultOptions, ..._options };
  const result = await manager.downloadServer(options);

  // Create EULA file automatically
  const eulaPath = path.join(options.outputDir, CoreService.EULA_FILE);
  let eulaContent = generateEula();
  writeFileSync(eulaPath, eulaContent);
  return result;
}
