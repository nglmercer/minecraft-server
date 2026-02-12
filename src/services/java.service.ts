import { findJavaVersion, getJavaInfoByVersion, getJavaInfo,FileUtils } from "java-path";
import { defaultPaths } from "java-path";
import { JavaInfoService } from "java-path";
import { taskManager } from "java-path";
import path from "path";
import { JavaMessages, CoreService } from "../constants";

export async function getOrInstallJava(version = 21) {
  console.log(JavaMessages.CHECKING(version));

  // First, check if the version is already installed locally
  const findResult = await findJavaVersion(defaultPaths.unpackPath, version);
  if (findResult) {
    console.log(JavaMessages.FOUND_LOCALLY(version, findResult.javaExecutable));
    return { findResult };
  }

  console.log(JavaMessages.NOT_FOUND(version));

  // Fetch available versions
  const allJavaVersions = await JavaInfoService.getInstallableVersions();
  
  // Handle potential ServiceResponse structure
  const releases = allJavaVersions.data?.releases;

  if (!releases) {
    console.error(JavaMessages.FAILED_FETCH);
    return null;
  }

  // Find the specific version
  const release = await JavaInfoService.filter(releases, Number(version));

  if (!release || !release.success || !release.data) {
    console.warn(JavaMessages.NO_RELEASE(version));
    return null;
  }

  // Download Java
  const fileName = `${CoreService.JAVA_ZIP_PREFIX}${version}${CoreService.JAVA_ZIP_EXTENSION}`;
  const downloadTask = await JavaInfoService.downloadJavaRelease(
    release.data,
    fileName,
  );

  if (!downloadTask || !downloadTask.data) {
    console.error(JavaMessages.FAILED_DOWNLOAD_INIT);
    return null;
  }

  // Track progress
  taskManager.on("task:progress", (task) => {
    if (task.id === downloadTask.data.taskId) {
      process.stdout.write(JavaMessages.DOWNLOAD_PROGRESS(task.progress));
    }
  });

  // Wait for download to complete
  try {
    await downloadTask.data.promise;
    console.log(JavaMessages.DOWNLOAD_COMPLETE);
  } catch (err) {
    console.error(JavaMessages.DOWNLOAD_FAILED, err);
    return null;
  }

  // Verify Checksum
  const downloadPath = path.join(defaultPaths.downloadPath, fileName);
  // Attempt to find checksum in release object (Adoptium format often uses binary.checksum)
  const rel = release as any;
  const expectedChecksum = rel.binary?.checksum || rel.checksum || rel.sha256;
  
  if (expectedChecksum) {
    console.log(JavaMessages.VERIFYING);
    const isValid = await FileUtils.verifyFileIntegrity(downloadPath, expectedChecksum);
    if (!isValid) {
      console.error(JavaMessages.CHECKSUM_FAILED);
      return null;
    }
    console.log(JavaMessages.CHECKSUM_VERIFIED);
  } else {
    console.warn(JavaMessages.NO_CHECKSUM);
  }

  // Unpack the downloaded Java
  console.log(JavaMessages.UNPACKING);
  const unpackTask = await taskManager.unpack(
    downloadPath,
    { destination: defaultPaths.unpackPath }
  );

  try {
    await unpackTask.promise;
    console.log(JavaMessages.UNPACK_COMPLETE);
  } catch (err) {
    console.error(JavaMessages.UNPACK_FAILED, err);
    return null;
  }

  // Verify the installation
  const newResult = await findJavaVersion(defaultPaths.unpackPath, version);
  if (!newResult) {
    console.error(JavaMessages.VERIFICATION_FAILED);
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
