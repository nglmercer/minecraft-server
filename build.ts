#!/usr/bin/env bun

/**
 * Simple multi-platform build script
 * Compiles the application for Windows, Linux, and macOS in the /dist-build folder
 */

import { spawn } from "bun";
import { mkdir } from "fs/promises";
import { join } from "path";

// Configuration
const ENTRY_FILE = "./index.ts";
const DIST_DIR = "./dist-build";

// Multi-platform targets
const TARGETS = [
  {
    name: "windows-x64",
    target: "bun-windows-x64",
    outfile: "app-windows.exe",
  },
  { name: "linux-x64", target: "bun-linux-x64", outfile: "app-linux" },
  {
    name: "linux-arm64",
    target: "bun-linux-arm64",
    outfile: "app-linux-arm64",
  },
  { name: "macos-x64", target: "bun-darwin-x64", outfile: "app-macos" },
  {
    name: "macos-arm64",
    target: "bun-darwin-arm64",
    outfile: "app-macos-arm64",
  },
];

async function buildApp() {
  try {
    // Create distribution directory if it doesn't exist
    await mkdir(DIST_DIR, { recursive: true });
    console.log(`📁 Build directory: ${DIST_DIR}`);

    // Build for each platform
    for (const platform of TARGETS) {
      console.log(`\n🔨 Building for ${platform.name}...`);

      const command = [
        "bun",
        "build",
        ENTRY_FILE,
        "--compile",
        `--target=${platform.target}`,
        `--outfile=${join(DIST_DIR, platform.outfile)}`,
        "--minify",
      ];

      console.log(`🚀 Running: ${command.join(" ")}`);

      // Execute the command using Bun.spawn
      const process = spawn({
        cmd: command,
        stdout: "inherit",
        stderr: "inherit",
      });

      // Wait for the process to complete
      const exitCode = await process.exited;

      if (exitCode === 0) {
        console.log(`✅ Build completed for ${platform.name}`);
      } else {
        console.error(
          `❌ Build failed for ${platform.name} with exit code: ${exitCode}`,
        );
      }
    }

    console.log("\n🎉 Multi-platform build completed!");
    console.log(`📦 Executables generated in: ${DIST_DIR}`);
  } catch (error) {
    console.error(`❌ Error during build:`, error);
    process.exit(1);
  }
}

// Execute the build
buildApp();
