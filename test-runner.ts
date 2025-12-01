#!/usr/bin/env node
import { spawn } from "node:child_process";

// Run the tests with Bun
const testProcess = spawn("bun", ["test"], {
  stdio: "inherit",
  shell: true,
});

testProcess.on("exit", (code) => {
  process.exit(code ?? 0);
});
