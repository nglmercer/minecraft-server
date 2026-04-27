import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type PropertyValue = string | number | boolean;

export class PropertiesManager {
  private readonly filePath: string;

  constructor(serverDir: string) {
    this.filePath = join(serverDir, "server.properties");
  }

  /**
   * Reads and parses the server.properties file
   */
  async getProperties(): Promise<Record<string, PropertyValue>> {
    if (!existsSync(this.filePath)) {
      return {};
    }

    const content = await readFile(this.filePath, "utf-8");
    const lines = content.split("\n");
    const properties: Record<string, PropertyValue> = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const [key, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=").trim();

      if (key) {
        properties[key.trim()] = this.parseValue(value);
      }
    }

    return properties;
  }

  /**
   * Updates the server.properties file with new values
   */
  async updateProperties(updates: Record<string, PropertyValue>): Promise<void> {
    const current = await this.getProperties();
    const updated = { ...current, ...updates };

    let content = "# Minecraft server properties\n# Modified by Guardian API\n";
    content += `# ${new Date().toISOString()}\n`;

    for (const [key, value] of Object.entries(updated)) {
      content += `${key}=${value}\n`;
    }

    await writeFile(this.filePath, content, "utf-8");
  }

  private parseValue(value: string): PropertyValue {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
    
    const num = Number(value);
    if (!isNaN(num) && value !== "") return num;
    
    return value;
  }
}
