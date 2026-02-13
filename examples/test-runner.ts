
/**
 * Automated P2P Test Runner
 * Spawns the server, runs the localhost test, and cleans up.
 */

import { spawn } from "bun";

async function main() {
  console.log("🚀 Starting Guardian Server...");
  
  const server = spawn(["bun", "index.ts"], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
        ...process.env,
        LIBP2P_PORT: "9000",
        API_PORT: "3000"
    }
  });

  const reader = server.stdout.getReader();
  const decoder = new TextDecoder();
  let serverStarted = false;

  // Wait for the server to be ready
  const timeout = setTimeout(() => {
    if (!serverStarted) {
      console.error("❌ Timeout: Server did not start in time.");
      server.kill();
      process.exit(1);
    }
  }, 25000);

  (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      process.stdout.write(text); // Mirror server output
      
      if (text.includes("Libp2p node started")) {
        serverStarted = true;
        clearTimeout(timeout);
        console.log("\n✅ Server is ready! Running tests...\n");
        runTests();
      }
    }
  })();

  async function runTests() {
    try {
      const test = spawn(["bun", "./examples/p2plib-client.ts"], {
        stdout: "inherit",
        stderr: "inherit"
      });
      
      const exitCode = await test.exited;
      console.log(`\n🏁 Test finished with code ${exitCode}`);
    } catch (err) {
      console.error("❌ Error running tests:", err);
    } finally {
      console.log("🛑 Shutting down server...");
      server.kill();
      process.exit(0);
    }
  }
}

main().catch(err => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
