import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import { Config } from "../../src/Config";

describe("Config", () => {
  const testConfigDir = path.join(process.cwd(), "test-config");
  const testConfigPath = path.join(testConfigDir, "config.yaml");
  const originalConfigPath = path.join(process.cwd(), "config", "config.yaml");

  beforeEach(() => {
    // Create a temporary config directory for tests
    if (!existsSync(testConfigDir)) {
      mkdirSync(testConfigDir, { recursive: true });
    }

    // Replace the config path for testing
    (Config.prototype as any).configPath = testConfigPath;
    (Config.prototype as any).configDir = testConfigDir;
  });

  afterEach(() => {
    // Clean up test config directory
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  it("should create default config when file does not exist", () => {
    const config = Config.getInstance();
    const data = config.loadSync();

    expect(data.server.jarPath).toBe("server.jar");
    expect(data.server.javaBin).toBe("java");
    expect(data.server.jvmOptions).toEqual(["-Xmx2G", "-Xms2G"]);
    expect(data.server.port).toBe(25565);
    expect(data.guardian.autoRestart).toBe(true);
    expect(data.guardian.maxRetries).toBe(3);
    expect(existsSync(testConfigPath)).toBe(true);
  });

  it("should load existing config and merge with defaults", () => {
    // Create a partial config file
    const partialConfig = `
server:
  jarPath: "custom-server.jar"
  port: 25566
`;

    Bun.write(testConfigPath, partialConfig);

    const config = Config.getInstance();
    const data = config.loadSync();

    // Should use custom values
    expect(data.server.jarPath).toBe("custom-server.jar");
    expect(data.server.port).toBe(25566);

    // Should fall back to defaults for missing values
    expect(data.server.javaBin).toBe("java");
    expect(data.server.jvmOptions).toEqual(["-Xmx2G", "-Xms2G"]);
    expect(data.guardian.autoRestart).toBe(true);
  });

  it("should handle Windows paths correctly", () => {
    const config = Config.getInstance();

    // Create a config with Windows paths
    const winConfig = `
server:
  jarPath: "server.jar"
  cwd: "C:\\Users\\test\\data\\server"

guardian:
  paths:
    data: "C:\\Users\\test\\data"
    logs: "C:\\Users\\test\\logs"
    backups: "C:\\Users\\test\\backups"
`;

    Bun.write(testConfigPath, winConfig);

    const data = config.loadSync();

    // Should parse paths correctly
    expect(data.server.cwd).toBe("C:\\Users\\test\\data\\server");
    expect(data.guardian.paths.data).toBe("C:\\Users\\test\\data");
    expect(data.guardian.paths.logs).toBe("C:\\Users\\test\\logs");
    expect(data.guardian.paths.backups).toBe("C:\\Users\\test\\backups");
  });

  it("should update server configuration", () => {
    const config = Config.getInstance();
    config.loadSync();

    config.updateServer({
      jarPath: "new-server.jar",
      port: 30000,
      jvmOptions: ["-Xmx4G", "-Xms4G", "-XX:+UseG1GC"],
    });

    expect(config.server.jarPath).toBe("new-server.jar");
    expect(config.server.port).toBe(30000);
    expect(config.server.jvmOptions).toEqual([
      "-Xmx4G",
      "-Xms4G",
      "-XX:+UseG1GC",
    ]);

    // Other properties should remain unchanged
    expect(config.server.javaBin).toBe("java");
  });

  it("should update guardian configuration", () => {
    const config = Config.getInstance();
    config.loadSync();

    config.updateGuardian({
      autoRestart: false,
      maxRetries: 5,
    });

    expect(config.guardian.autoRestart).toBe(false);
    expect(config.guardian.maxRetries).toBe(5);

    // Other properties should remain unchanged
    expect(config.guardian.retryDelayMs).toBe(5000);
  });

  it("should handle empty config file", () => {
    // Create an empty config file
    Bun.write(testConfigPath, "");

    const config = Config.getInstance();
    const data = config.loadSync();

    // Should fall back to defaults
    expect(data.server.jarPath).toBe("server.jar");
    expect(data.server.javaBin).toBe("java");
    expect(data.guardian.autoRestart).toBe(true);
  });

  it("should handle invalid YAML", () => {
    // Create an invalid YAML file
    Bun.write(testConfigPath, "invalid: yaml: content:");

    const config = Config.getInstance();

    // Should not throw error, but use defaults instead
    const data = config.loadSync();
    expect(data.server.jarPath).toBe("server.jar");
    expect(data.server.javaBin).toBe("java");
  });
});
