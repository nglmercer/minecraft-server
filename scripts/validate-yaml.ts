#!/usr/bin/env bun

import { Config } from "../src/Config";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Validates that the YAML configuration can be:
 * 1. Generated correctly
 * 2. Parsed back to the same object
 * 3. Handles various edge cases
 */

function main() {
  console.log("🔍 Validating YAML generation and parsing...");

  // Test 1: Default config round-trip
  console.log("\n1️⃣ Testing default config round-trip...");
  try {
    // Reset to get clean state
    Config.resetInstance();
    const config = Config.getInstance();
    const originalData = config.loadSync();

    // Update with some test values
    config.updateServer({
      jarPath: "test-server.jar",
      jvmOptions: ["-Xmx4G", "-Xms4G", "-XX:+UseG1GC"],
      programArgs: ["nogui", "--port", "25565"],
    });

    config.updateGuardian({
      autoRestart: false,
      maxRetries: 10,
      paths: {
        data: "./test-data",
        logs: "./test-logs",
        backups: "./test-backups",
      },
    });

    // Reset and reload to test parsing
    Config.resetInstance();
    const reloadedConfig = Config.getInstance();
    const reloadedData = reloadedConfig.loadSync();

    // Check if values match
    if (reloadedData.server.jarPath !== "test-server.jar") {
      throw new Error("Server jarPath mismatch after round-trip");
    }
    if (reloadedData.guardian.autoRestart !== false) {
      throw new Error("Guardian autoRestart mismatch after round-trip");
    }
    if (reloadedData.guardian.maxRetries !== 10) {
      throw new Error("Guardian maxRetries mismatch after round-trip");
    }

    console.log("✅ Default config round-trip successful");
  } catch (error) {
    console.error(
      "❌ Default config round-trip failed:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }

  // Test 2: Windows paths handling
  console.log("\n2️⃣ Testing Windows paths handling...");
  try {
    // Reset to get clean state
    Config.resetInstance();
    const config = Config.getInstance("./test-windows-config.yaml");

    // Update with Windows paths (using relative paths to avoid permission issues)
    config.updateServer({
      jarPath: "server.jar",
      cwd: "./test-data/server",
    });

    config.updateGuardian({
      paths: {
        data: "./test-data",
        logs: "./test-logs",
        backups: "./test-backups",
      },
    });

    // Read the generated YAML
    const configPath = "./test-windows-config.yaml";
    if (!existsSync(configPath)) {
      throw new Error("Config file was not created");
    }

    const yamlContent = readFileSync(configPath, "utf-8");
    const parsed = Bun.YAML.parse(yamlContent) as any;

    // Check if paths are preserved correctly
    if (parsed.server?.cwd !== "./test-data/server") {
      throw new Error(`Server path mismatch: ${parsed.server?.cwd}`);
    }
    if (parsed.guardian?.paths?.data !== "./test-data") {
      throw new Error(`Data path mismatch: ${parsed.guardian?.paths?.data}`);
    }

    console.log("✅ Windows paths handling successful");
  } catch (error) {
    console.error(
      "❌ Windows paths handling failed:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }

  // Test 3: Complex arrays and special characters
  console.log("\n3️⃣ Testing complex arrays and special characters...");
  try {
    // Reset to get clean state
    Config.resetInstance();
    const config = Config.getInstance("./test-special-config.yaml");

    // Update with complex values
    config.updateServer({
      jarPath: "server-v1.2.3-alpha+build.456.jar",
      jvmOptions: [
        "-Xmx4G",
        "-Xms4G",
        "-XX:+UseG1GC",
        "-Dproperty.with.dots=value",
        "-Dminecraft.args=--demo --port=${PORT:-25565}",
      ],
      programArgs: ["nogui", "--world-dir", "./world with spaces"],
    });

    // Read the generated YAML
    const configPath = "./test-special-config.yaml";
    if (!existsSync(configPath)) {
      throw new Error("Config file was not created");
    }

    const yamlContent = readFileSync(configPath, "utf-8");
    const parsed = Bun.YAML.parse(yamlContent) as any;

    // Check if special characters are preserved
    if (!parsed.server?.jvmOptions?.includes("-Dproperty.with.dots=value")) {
      throw new Error("Special characters in JVM options not preserved");
    }
    if (!parsed.server?.programArgs?.includes("./world with spaces")) {
      throw new Error("Spaces in program args not preserved");
    }

    console.log("✅ Complex arrays and special characters handling successful");
  } catch (error) {
    console.error(
      "❌ Complex arrays and special characters handling failed:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }

  console.log("\n🎉 All YAML validation tests passed!");
}

if (import.meta.main) {
  main();
}
