import { getOrInstallJava } from "./src/java.service";
import { downloadServer } from "./src/core.service";
async function main() {
  const result = await getOrInstallJava(23);
  console.log("result", result);
  if (result) {
    const coreInfo = await downloadServer({
      version: "1.19.2",
      core: "paper",
    });
    console.log("Core info:", coreInfo);
    return {
      result,
      coreInfo,
    };
  }
  return result;
}
main()
  .then(() => {
    console.log("Installation completed successfully.");
  })
  .catch((error) => {
    console.error("Installation error:", error);
  });
