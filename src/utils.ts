import { $ } from "bun";

export const Utils = {
  async ensureEula(cwd: string): Promise<void> {
    const eulaFile = Bun.file(`${cwd}/eula.txt`);
    if (await eulaFile.exists()) {
      const content = await eulaFile.text();
      if (content.includes("eula=true")) return;
    }
    await Bun.write(`${cwd}/eula.txt`, "eula=true\n");
  },

  //async backupWorld()
};
