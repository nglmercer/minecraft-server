import { GuardianSystem, enumMode, DEFAULT_MODE } from "./src/core/system";
import { ExitCodes } from "./src/constants";

/**
 * Entry point for the application.
 * Parses command line arguments and initiates the GuardianSystem.
 */
async function main() {
  const args = process.argv.slice(2);
  const isSetupOnly = args.includes("--setup") || args.includes("-s");

  const system = new GuardianSystem();

  if (isSetupOnly) {
    return await system.run(enumMode.setup);
  } else {
    return await system.run(DEFAULT_MODE);
  }
}

main()
  .then((exitCode) => {
    // If we're in full mode, the process stays alive because of 
    // event listeners or the running server process.
    // However, if run() returns, it means it's finished or setup is done.
    if (exitCode !== undefined && exitCode !== null) {
      // Only exit if we have a specific exit code (like in setup mode or error)
      if (exitCode !== ExitCodes.SUCCESS) {
        process.exit(exitCode);
      }
    }
  })
  .catch((error) => {
    console.error("💥 Critical system error:", error);
    process.exit(1);
  });
