// /extra/tunnel/binary-manager.ts
import { chmodSync, existsSync, mkdirSync, statSync, writeFileSync } from "fs";
import path from "path";
import type { GitHubAsset, Logger, PlayitArch, Platform } from "./types";
import { GitHubAPIClient, createGitHubClient } from "./github-api";
import { AssetNotFoundError } from "./types";

/**
 * Configuration for BinaryManager
 */
export interface BinaryManagerConfig {
  /** Directory to store downloaded binaries */
  dataDir: string;
  /** GitHub repository (owner/name) */
  githubRepo?: string;
  /** Optional logger */
  logger?: Logger;
  /** Optional GitHub token for rate limits */
  githubToken?: string;
  /** User agent for HTTP requests */
  userAgent?: string;
}

/**
 * Result of binary download operation
 */
export interface BinaryDownloadResult {
  /** Path where the binary was downloaded to */
  binaryPath: string;
  /** Size in bytes */
  size: number;
  /** Whether it was already cached */
  wasCached: boolean;
}

/**
 * Information about a binary asset
 */
export interface BinaryAssetInfo {
  /** Asset name */
  name: string;
  /** Download URL */
  url: string;
  /** Size in bytes */
  size: number;
  /** Architecture */
  architecture: PlayitArch;
  /** Platform */
  platform: Platform;
  /** Full asset object */
  asset: GitHubAsset;
}

/**
 * Manages the download, installation, and verification of playit binaries
 */
export class BinaryManager {
  private readonly dataDir: string;
  private readonly githubRepo: string;
  private readonly githubClient: GitHubAPIClient;
  private readonly logger?: Logger;
  private readonly defaultBinaryName = "playit";

  // Platform patterns for matching assets
  private static readonly PLATFORM_PATTERNS: Record<
    Platform,
    { osPrefix: string; archMap: Record<string, PlayitArch> }
  > = {
    linux: {
      osPrefix: "playit-linux-",
      archMap: {
        x64: "x86_64",
        arm64: "aarch64",
        arm: "armv7",
        ia32: "i686",
      },
    },
    darwin: {
      osPrefix: "playit-macos-",
      archMap: {
        x64: "x86_64",
        arm64: "aarch64",
      },
    },
    win32: {
      osPrefix: "playit-windows-",
      archMap: {
        x64: "x86_64",
        arm64: "aarch64",
        ia32: "i686",
      },
    },
  };

  constructor(config: BinaryManagerConfig) {
    this.dataDir = config.dataDir;
    this.githubRepo = config.githubRepo || "playit-cloud/playit-agent";
    this.logger = config.logger;

    // Ensure data directory exists
    this.ensureDataDir();

    // Create GitHub API client
    this.githubClient = createGitHubClient(this.githubRepo, {
      logger: config.logger,
      token: config.githubToken,
      userAgent: config.userAgent || "minecraft-server-tunnel",
    });
  }
  /**
   * Downloads the latest binary from GitHub releases
   * @returns Promise<BinaryDownloadResult>
   */
  async downloadLatestBinary(): Promise<BinaryDownloadResult> {
    this.logger?.info("Checking for latest binary...");

    // Fetch latest release
    const release = await this.githubClient.fetchLatestRelease();
    this.logger?.info(`Found release: ${release.tag_name} (${release.name})`);

    // Find the best matching asset for current platform
    const binaryAsset = this.findBestBinaryAsset(release.assets);
    if (!binaryAsset) {
      const availableAssets = release.assets.map((a) => a.name);
      throw new AssetNotFoundError(
        `No compatible binary found for ${this.getPlatform()} ${this.getArchitecture()}`,
        availableAssets,
        this.getArchitecture(),
        this.getPlatform(),
      );
    }

    this.logger?.info(`Found matching asset: ${binaryAsset.name}`);

    // Check if already cached
    const binaryPath = this.getBinaryPath(binaryAsset.name);
    if (existsSync(binaryPath) || (await this.verifyBinary(binaryPath))) {
      const stats = statSync(binaryPath);
      if (stats.size === binaryAsset.size) {
        this.logger?.info(
          `Binary already exists and size matches. Skipping download.`,
        );
        return {
          binaryPath,
          size: stats.size,
          wasCached: true,
        };
      }
    }

    this.logger?.info(
      `Downloading binary from ${binaryAsset.browser_download_url}`,
    );
    const binaryData = await this.githubClient.downloadBlob(
      binaryAsset.browser_download_url,
    );

    const binaryDir = path.dirname(binaryPath);
    if (!existsSync(binaryDir)) {
      mkdirSync(binaryDir, { recursive: true });
    }

    writeFileSync(binaryPath, binaryData);

    this.setExecutablePermissions(binaryPath);

    this.logger?.info(
      `Binary downloaded successfully: ${binaryPath} (${binaryData.length} bytes)`,
    );

    return {
      binaryPath,
      size: binaryData.length,
      wasCached: false,
    };
  }

  /**
   * Verifies that the binary exists and is executable
   * @param binaryPath Optional path to check (defaults to configured binary path)
   * @returns Promise<boolean>
   */
  async verifyBinary(binaryPath?: string): Promise<boolean> {
    const path = binaryPath || this.getDefaultBinaryPath();

    if (!existsSync(path)) {
      this.logger?.debug(`Binary not found: ${path}`);
      return false;
    }

    try {
      this.setExecutablePermissions(path);
      this.logger?.debug(`Binary verified: ${path}`);
      return true;
    } catch (error) {
      this.logger?.error(
        `Failed to set executable permissions on ${path}: ${error}`,
      );
      return false;
    }
  }

  /**
   * Gets the default path for the binary
   * @returns string
   */
  getDefaultBinaryPath(): string {
    return path.join(this.dataDir, this.defaultBinaryName);
  }

  /**
   * Finds the best matching binary asset for the current platform
   * @param assets Array of GitHub assets
   * @returns GitHubAsset | undefined
   */
  findBestBinaryAsset(assets: GitHubAsset[]): GitHubAsset | undefined {
    const platform = this.getPlatform();
    const arch = this.getArchitecture();
    const pattern = BinaryManager.PLATFORM_PATTERNS[platform];

    if (!pattern) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    // Convert Node arch to playit arch
    const playitArch = pattern.archMap[arch];
    if (!playitArch) {
      throw new Error(
        `Unsupported architecture: ${arch} for platform ${platform}`,
      );
    }

    this.logger?.debug(
      `Looking for binary: platform=${platform}, arch=${arch}, playitArch=${playitArch}`,
    );

    // Priority 1: Exact match (platform + arch without "signed" or "debug")
    const exactMatch = assets.find((asset) => {
      const name = asset.name.toLowerCase();
      const hasExactPlatform = name.includes(pattern.osPrefix.toLowerCase());
      const hasExactArch = name.includes(playitArch.toLowerCase());
      const isNotSigned = !name.includes("signed");
      const isNotDebug = !name.includes("debug");
      const isBinary = name.match(/\.(tar\.gz|zip|exe|bin)$/);

      return (
        hasExactPlatform &&
        hasExactArch &&
        isNotSigned &&
        isNotDebug &&
        isBinary
      );
    });

    if (exactMatch) {
      this.logger?.debug(`Found exact match: ${exactMatch.name}`);
      return exactMatch;
    }

    // Priority 2: Match without debug/suffix, with platform prefix
    const platformMatch = assets.find((asset) => {
      const name = asset.name.toLowerCase();
      return (
        name.includes(pattern.osPrefix.toLowerCase()) && !name.includes("debug")
      );
    });

    if (platformMatch) {
      this.logger?.debug(`Found platform match: ${platformMatch.name}`);
      return platformMatch;
    }

    // Priority 3: Fallback to any asset with matching architecture
    const archMatch = assets.find((asset) =>
      asset.name.toLowerCase().includes(playitArch.toLowerCase()),
    );

    if (archMatch) {
      this.logger?.debug(`Found arch match: ${archMatch.name}`);
      return archMatch;
    }

    // No match found
    this.logger?.debug(
      `No binary found for ${platform} ${arch}. Assets: ${assets.map((a) => a.name).join(", ")}`,
    );
    return undefined;
  }

  /**
   * Clears the cached binary
   * @returns boolean Success
   */
  clearCache(): boolean {
    try {
      const binaries = this.getAllBinaryPaths();
      let removed = 0;

      for (const binary of binaries) {
        if (existsSync(binary)) {
          removed++;
        }
      }

      this.logger?.info(
        `Cleared ${removed} cached binary file(s) from ${this.dataDir}`,
      );
      return removed > 0;
    } catch (error) {
      this.logger?.error(`Failed to clear cache: ${error}`);
      return false;
    }
  }

  /**
   * Ensures the data directory exists
   */
  private ensureDataDir(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
      this.logger?.debug(`Created data directory: ${this.dataDir}`);
    }
  }

  /**
   * Gets the binary path for a specific asset name
   * @returns string
   */
  private getBinaryPath(assetName: string): string {
    const isWindows = process.platform === "win32";
    const hasExt = assetName.match(/\.(exe|bin|tar\.gz|zip)$/i);

    if (isWindows && !assetName.toLowerCase().endsWith(".exe")) {
      return path.join(this.dataDir, "playit.exe");
    }

    if (
      assetName.toLowerCase().endsWith(".tar.gz") ||
      assetName.toLowerCase().endsWith(".zip")
    ) {
      // Remove archive extension
      const baseName = assetName
        .replace(/\.tar\.gz$/i, "")
        .replace(/\.zip$/i, "")
        .replace(/\.(exe|bin)$/i, "");
      return path.join(this.dataDir, baseName);
    }

    return path.join(this.dataDir, assetName);
  }

  /**
   * Gets all possible binary paths in the data directory
   * @returns string[]
   */
  private getAllBinaryPaths(): string[] {
    return [
      path.join(this.dataDir, "playit"),
      path.join(this.dataDir, "playit.exe"),
      path.join(this.dataDir, "playit-linux-x86-64"),
      path.join(this.dataDir, "playit-macos-aarch64"),
    ];
  }

  /**
   * Sets executable permissions on a file
   * @param binaryPath Path to the binary
   * @throws Error if permission setting fails
   */
  private setExecutablePermissions(binaryPath: string): void {
    // Only apply to non-Windows platforms
    if (process.platform === "win32") {
      return;
    }

    try {
      chmodSync(binaryPath, 0o755);
    } catch (error) {
      this.logger?.warn(
        `Failed to set executable permissions on ${binaryPath}: ${error}`,
      );
    }
  }

  /**
   * Gets the current platform identifier
   * @returns Platform
   */
  private getPlatform(): Platform {
    const platform = process.platform as string;
    if (platform !== "linux" && platform !== "darwin" && platform !== "win32") {
      throw new Error(`Unsupported platform: ${platform}`);
    }
    return platform;
  }

  /**
   * Gets the current architecture identifier
   * @returns NodeJS.Architecture
   */
  private getArchitecture(): string {
    return process.arch;
  }
}
