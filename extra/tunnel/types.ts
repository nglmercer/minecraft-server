// minecraft-server/extra/tunnel/types.ts

// ============================================================================
// External Type Imports
// ============================================================================
import type { ITask, TaskEvents, DownloadResult } from "node-task-manager";

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Options for configuring the Playit tunnel instance
 */
export interface PlayitOptions {
  /** Path to the playit binary. If not specified, it will be downloaded. */
  binaryPath?: string;
  /** Playit token (from login). */
  token?: string;
  /** Extra arguments to pass to playit. */
  args?: string[];
  /** Timeout in milliseconds for operations. */
  timeoutMs?: number;
  /** Optional directory for storing the binary and cache. */
  dataDir?: string;
  /** Playit profile name to use (auto-detected from config if available). */
  profile?: string;
}

/**
 * Options for starting a tunnel
 */
export interface TunnelStartOptions {
  /** Legacy callback on completion */
  onComplete?: (result: TunnelResult, task: ITask) => void;
}

/**
 * Options for stopping a tunnel
 */
export interface TunnelStopOptions {
  /** Legacy callback on completion */
  onComplete?: (result: TunnelResult, task: ITask) => void;
}

/**
 * Options for restarting a tunnel
 */
export interface TunnelRestartOptions {
  /** Legacy callback on completion */
  onComplete?: (result: TunnelResult, task: ITask) => void;
}

/**
 * Options for checking binary existence
 */
export interface CheckBinaryOptions {
  /** Legacy callback on completion */
  onComplete?: (
    result: { exists: boolean; binaryPath: string },
    task: ITask,
  ) => void;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of tunnel operations
 */
export interface TunnelResult {
  /** The identifier of the task that was created */
  taskId: string;
  /** The process ID of the tunnel (if running) */
  pid: number | undefined;
  /** The path to the playit binary being used */
  binaryPath: string;
}

/**
 * Result of binary check operation
 */
export interface BinaryCheckResult {
  /** Whether the binary exists and is executable */
  exists: boolean;
  /** The path to the binary */
  binaryPath: string;
}

// ============================================================================
// GitHub API Types
// ============================================================================

/**
 * Represents a GitHub release asset
 */
export interface GitHubAsset {
  /** Name of the asset file */
  name: string;
  /** URL to download the asset */
  browser_download_url: string;
  /** Size of the asset in bytes */
  size: number;
  /** Content type */
  content_type: string;
}

/**
 * Represents a GitHub release
 */
export interface GitHubRelease {
  /** Release tag name */
  tag_name: string;
  /** Release name */
  name: string;
  /** Array of assets */
  assets: GitHubAsset[];
  /** Release body */
  body: string;
}

// ============================================================================
// Platform Detection Types
// ============================================================================

/**
 * Supported platforms
 */
export type Platform = "linux" | "darwin" | "win32";

/**
 * Supported architectures
 */
export type Architecture = "x64" | "arm64" | "arm" | "ia32";

/**
 * Mapped architecture for playit binaries
 */
export type PlayitArch = "x86_64" | "aarch64" | "armv7" | "i686" | string;

// ============================================================================
// Operation Types
// ============================================================================

/**
 * Supported operation types for task tracking
 */
export type TunnelOperation =
  | "download"
  | "start"
  | "stop"
  | "restart"
  | "check";

// ============================================================================
// Error Types
// ============================================================================

/**
 * Base error class for Playit tunnel errors
 */
export class PlayitError extends Error {
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "PlayitError";
  }
}

/**
 * Error thrown when platform is not supported
 */
export class PlatformError extends PlayitError {
  constructor(message: string) {
    super(message);
    this.name = "PlatformError";
  }
}

/**
 * Error thrown when GitHub API request fails
 */
export class GitHubAPIError extends PlayitError {
  constructor(
    message: string,
    public statusCode?: number,
    public responseBody?: string,
  ) {
    super(message);
    this.name = "GitHubAPIError";
  }
}

/**
 * Error thrown when no suitable asset is found
 */
export class AssetNotFoundError extends PlayitError {
  constructor(
    message: string,
    public availableAssets: string[],
    public architecture: string,
    public platform: string,
  ) {
    super(message);
    this.name = "AssetNotFoundError";
  }
}

/**
 * Error thrown when binary download fails
 */
export class DownloadError extends PlayitError {
  constructor(
    message: string,
    public url: string,
  ) {
    super(message);
    this.name = "DownloadError";
  }
}

/**
 * Error thrown when tunnel process fails to start
 */
export class TunnelStartError extends PlayitError {
  constructor(
    message: string,
    public lastOutput: string,
    public binaryPath: string,
  ) {
    super(message);
    this.name = "TunnelStartError";
  }
}

/**
 * Error thrown when tunnel is already running
 */
export class TunnelRunningError extends PlayitError {
  constructor(public pid: number) {
    super(`Tunnel is already running with PID ${pid}`);
    this.name = "TunnelRunningError";
  }
}

/**
 * Error thrown when binary is not found or not executable
 */
export class BinaryMissingError extends PlayitError {
  constructor(public binaryPath: string) {
    super(
      `Binary not found or not executable: ${binaryPath}. Call download() first.`,
    );
    this.name = "BinaryMissingError";
  }
}

/**
 * Error thrown when tunnel fails to stop
 */
export class TunnelStopError extends PlayitError {
  constructor(
    message: string,
    public pid: number | undefined,
  ) {
    super(message);
    this.name = "TunnelStopError";
  }
}

// ============================================================================
// Internal Types & Interfaces
// ============================================================================

/**
 * Result of processing a GitHub release
 */
export interface ProcessedRelease {
  asset: GitHubAsset;
  release: GitHubRelease;
}

/**
 * Platform-specific binary naming conventions
 */
export interface PlatformBinaryPattern {
  osPrefix: string; // e.g., "playit-linux-"
  archMap: Record<string, string>; // x64 -> x86_64, etc.
  supportedArchs: PlayitArch[];
}

// ============================================================================
// Tooling Types
// ============================================================================

/**
 * Logger interface for controlling output
 */
export interface Logger {
  info(message: string): void;
  error(message: string): void;
  warn(message: string): void;
  debug(message: string): void;
}

/**
 * Default console logger implementation
 */
export class ConsoleLogger implements Logger {
  info(message: string): void {
    console.log(`[Playit] ${message}`);
  }

  error(message: string): void {
    console.error(`[Playit] ${message}`);
  }

  warn(message: string): void {
    console.warn(`[Playit] ${message}`);
  }

  debug(message: string): void {
    if (process.env.DEBUG) {
      console.debug(`[Playit] ${message}`);
    }
  }
}

// ============================================================================
// Export Helpers
// ============================================================================

/**
 * Type guard for GitHubAsset
 */
export function isGitHubAsset(obj: unknown): obj is GitHubAsset {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "name" in obj &&
    "browser_download_url" in obj
  );
}

/**
 * Type guard for TunnelResult
 */
export function isTunnelResult(obj: unknown): obj is TunnelResult {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "taskId" in obj &&
    "binaryPath" in obj
  );
}
