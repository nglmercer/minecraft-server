import { findJavaVersion, getJavaInfoByVersion, getJavaInfo,FileUtils } from "java-path";
import { defaultPaths } from "java-path";
import { JavaInfoService } from "java-path";
import { taskManager } from "java-path";
import path from "path";

export async function getOrInstallJava(version = 21) {
  console.log(`Checking for Java ${version}...`);

  // First, check if the version is already installed locally
  const findResult = await findJavaVersion(defaultPaths.unpackPath, version);
  if (findResult) {
    console.log(`✅ Found Java ${version} locally: ${findResult.javaExecutable}`);
    return { findResult };
  }

  console.log(`⬇️ Java ${version} not found locally. Initiating download...`);

  // Fetch available versions
  const allJavaVersions = await JavaInfoService.getInstallableVersions();
  
  // Handle potential ServiceResponse structure
  const releases = allJavaVersions.data?.releases;

  if (!releases) {
    console.error("❌ Failed to fetch installable Java versions.");
    return null;
  }

  // Find the specific version
  const release = await JavaInfoService.filter(releases, Number(version));

  if (!release || !release.success || !release.data) {
    console.warn(`⚠️ No release found for Java ${version}`);
    return null;
  }

  // Download Java
  const fileName = `java-${version}.zip`;
  const downloadTask = await JavaInfoService.downloadJavaRelease(
    release.data,
    fileName,
  );

  if (!downloadTask || !downloadTask.data) {
    console.error("❌ Failed to initialize download task");
    return null;
  }

  // Track progress
  taskManager.on("task:progress", (task) => {
    if (task.id === downloadTask.data.taskId) {
      process.stdout.write(`\rDownloading: ${task.progress.toFixed(1)}%`);
    }
  });

  // Wait for download to complete
  try {
    await downloadTask.data.promise;
    console.log("\n✅ Download complete.");
  } catch (err) {
    console.error("\n❌ Download failed:", err);
    return null;
  }

  // Verify Checksum
  const downloadPath = path.join(defaultPaths.downloadPath, fileName);
  // Attempt to find checksum in release object (Adoptium format often uses binary.checksum)
  const rel = release as any;
  const expectedChecksum = rel.binary?.checksum || rel.checksum || rel.sha256;
  
  if (expectedChecksum) {
    console.log(`Verifying checksum...`);
    const isValid = await FileUtils.verifyFileIntegrity(downloadPath, expectedChecksum);
    if (!isValid) {
      console.error("❌ Checksum verification failed! The downloaded file may be corrupted.");
      return null;
    }
    console.log("✅ Checksum verified.");
  } else {
    console.warn("⚠️  No checksum info found in release, skipping verification.");
  }

  // Unpack the downloaded Java
  console.log("📦 Unpacking Java...");
  const unpackTask = await taskManager.unpack(
    downloadPath,
    { destination: defaultPaths.unpackPath }
  );

  try {
    await unpackTask.promise;
    console.log("✅ Unpack complete.");
  } catch (err) {
    console.error("❌ Unpack failed:", err);
    return null;
  }

  // Verify the installation
  const newResult = await findJavaVersion(defaultPaths.unpackPath, version);
  if (!newResult) {
    console.error("❌ Verification failed after installation.");
    return null;
  }
  
  return { findResult: newResult };
}

// Usage
// getOrInstallJava(21)
//   .then((result) => {
//     console.log("Installation result:", result);
//   })
//   .catch((error) => {
//     console.error("Installation error:", error);
//   });
