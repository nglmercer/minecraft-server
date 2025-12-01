import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  existsSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { Config } from "../../../src/Config";

describe("YAML Functionality", () => {
  const testConfigDir = path.join(process.cwd(), "test-yaml-config");
  const testConfigPath = path.join(testConfigDir, "config.yaml");

  beforeEach(() => {
    // Reset the singleton instance for clean testing
    Config.resetInstance();

    // Create a temporary config directory for tests
    if (!existsSync(testConfigDir)) {
      mkdirSync(testConfigDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test config directory
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true, force: true });
    }

    // Reset the singleton instance
    Config.resetInstance();
  });

  it("should generate valid YAML using Bun.YAML.stringify", () => {
    const config = Config.getInstance(testConfigPath);
    config.loadSync();

    // Update with relative paths to avoid permission issues
    const testDir = path.join(process.cwd(), "test-data");
    config.updateServer({
      jarPath: "server.jar",
      cwd: path.join(testDir, "server"),
      jvmOptions: ["-Xmx4G", "-Xms4G", "-XX:+UseG1GC"],
    });

    config.updateGuardian({
      paths: {
        data: testDir,
        logs: path.join(testDir, "logs"),
        backups: path.join(testDir, "backups"),
      },
    });

    // Ensure the config file was saved
    expect(existsSync(testConfigPath)).toBe(true);

    // Read the generated YAML
    const yamlContent = readFileSync(testConfigPath, "utf-8");
    expect(yamlContent).toContain("# Guardian Server Configuration");

    // Try to parse it back to ensure it's valid
    const parsed = Bun.YAML.parse(yamlContent) as any;
    expect(parsed).toBeDefined();
    expect(parsed.server.jarPath).toBe("server.jar");
    expect(parsed.server.cwd).toBe(path.join(testDir, "server"));
    expect(parsed.server.jvmOptions).toContain("-Xmx4G");
    expect(parsed.guardian.paths.data).toBe(testDir);
  });

  it("should handle all path types correctly in generated YAML", () => {
    const config = Config.getInstance(testConfigPath);
    config.loadSync();

    // Test with various path formats (using only relative paths for tests)
    config.updateServer({
      jarPath: "./server.jar",
      cwd: "./data/server",
    });

    config.updateGuardian({
      paths: {
        data: "./data",
        logs: "./logs",
        backups: "../backups",
      },
    });

    // Ensure the config file was saved
    expect(existsSync(testConfigPath)).toBe(true);

    // Read the generated YAML
    const yamlContent = readFileSync(testConfigPath, "utf-8");

    // Try to parse it back
    const parsed = Bun.YAML.parse(yamlContent) as any;
    expect(parsed.server.jarPath).toBe("./server.jar");
    expect(parsed.server.cwd).toBe("./data/server");
    expect(parsed.guardian.paths.data).toBe("./data");
    expect(parsed.guardian.paths.logs).toBe("./logs");
    expect(parsed.guardian.paths.backups).toBe("../backups");
  });

  it("should preserve array formatting in generated YAML", () => {
    const config = Config.getInstance(testConfigPath);
    config.loadSync();

    // Update with complex arrays
    config.updateServer({
      jvmOptions: [
        "-Xmx4G",
        "-Xms4G",
        "-XX:+UseG1GC",
        "-XX:MaxGCPauseMillis=200",
        "-Dlog4j2.formatMsgNoLookups=true",
      ],
      programArgs: ["nogui", "--port", "25565", "--world-dir", "./world"],
    });

    // Ensure the config file was saved
    expect(existsSync(testConfigPath)).toBe(true);

    // Read the generated YAML
    const yamlContent = readFileSync(testConfigPath, "utf-8");

    // Try to parse it back
    const parsed = Bun.YAML.parse(yamlContent) as any;
    expect(parsed.server.jvmOptions).toHaveLength(5);
    expect(parsed.server.jvmOptions).toContain("-XX:MaxGCPauseMillis=200");
    expect(parsed.server.programArgs).toHaveLength(5);
    expect(parsed.server.programArgs).toContain("--world-dir");
  });

  it("should round-trip YAML correctly", () => {
    // Create an initial config
    const config = Config.getInstance(testConfigPath);
    config.loadSync();

    // Use relative paths to avoid permission issues
    const testDir = "./test-data";

    // Update with complex data
    config.updateServer({
      jarPath: "server.jar",
      cwd: path.join(testDir, "server"),
      jvmOptions: ["-Xmx4G", "-Xms4G", "-XX:+UseG1GC"],
      programArgs: ["nogui", "--port", "30000"],
    });

    config.updateGuardian({
      autoRestart: false,
      maxRetries: 5,
      paths: {
        data: testDir,
        logs: path.join(testDir, "logs"),
        backups: path.join(testDir, "backups"),
      },
    });

    // Reset and reload the config
    Config.resetInstance();
    const reloadedConfig = Config.getInstance(testConfigPath);
    const data = reloadedConfig.loadSync();

    // Verify all values match
    expect(data.server.jarPath).toBe("server.jar");
    expect(data.server.cwd).toBe(path.join(testDir, "server"));
    expect(data.server.jvmOptions).toEqual([
      "-Xmx4G",
      "-Xms4G",
      "-XX:+UseG1GC",
    ]);
    expect(data.server.programArgs).toEqual(["nogui", "--port", "30000"]);
    expect(data.guardian.autoRestart).toBe(false);
    expect(data.guardian.maxRetries).toBe(5);
    expect(data.guardian.paths.data).toBe(testDir);
    expect(data.guardian.paths.logs).toBe(path.join(testDir, "logs"));
    expect(data.guardian.paths.backups).toBe(path.join(testDir, "backups"));
  });

  it("should handle special characters in generated YAML", () => {
    const config = Config.getInstance(testConfigPath);
    config.loadSync();

    // Update with special characters
    config.updateServer({
      jarPath: "server-v1.2.3-alpha+build.456.jar",
      jvmOptions: [
        "-Dminecraft.args=--demo --port=${PORT:-25565}",
        "-Dproperty.with.dots=value",
        "-Xmx4G",
      ],
    });

    // Ensure the config file was saved
    expect(existsSync(testConfigPath)).toBe(true);

    // Read the generated YAML
    const yamlContent = readFileSync(testConfigPath, "utf-8");

    // Try to parse it back
    const parsed = Bun.YAML.parse(yamlContent) as any;
    expect(parsed.server.jarPath).toBe("server-v1.2.3-alpha+build.456.jar");
    expect(parsed.server.jvmOptions).toContain(
      "-Dminecraft.args=--demo --port=${PORT:-25565}",
    );
    expect(parsed.server.jvmOptions).toContain("-Dproperty.with.dots=value");
  });
});
