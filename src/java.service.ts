import { findJavaVersion, getJavaInfoByVersion, getJavaInfo } from "java-path";
import { defaultPaths } from "java-path";
import { JavaInfoService } from "java-path";
import { taskManager } from "java-path";
import path from "path";

export async function getOrInstallJava(version = 21) {
  // First, check if the version is already installed
  const findResult = await findJavaVersion(defaultPaths.unpackPath, version);
  if (!findResult) {
    const allJavaVersions = await JavaInfoService.getInstallableVersions();
    // Find the specific version
    const findVersion = await JavaInfoService.filter(
      allJavaVersions.data.releases,
      Number(version),
    );

    if (!findVersion.data) {
      console.warn("No Java version found");
      return { findVersion };
    }

    // Download Java
    const downloadJava = await JavaInfoService.downloadJavaRelease(
      findVersion.data,
      `java-${version}.zip`,
    );

    if (!downloadJava || !downloadJava.data) {
      console.error("Failed to download Java");
      return { findVersion };
    }

    // Wait for download to complete
    await downloadJava.data.promise;

    // Unpack the downloaded Java
    const { promise, taskId } = await taskManager.unpack(
      path.join(defaultPaths.downloadPath, `java-${version}.zip`),
    );

    await promise;

    // Verify the installation
    const newResult = await findJavaVersion(defaultPaths.unpackPath, version);
    return { findResult: newResult };
  }

  return { findResult };
}

// Usage
// getOrInstallJava(21)
//   .then((result) => {
//     console.log("Installation result:", result);
//   })
//   .catch((error) => {
//     console.error("Installation error:", error);
//   });
