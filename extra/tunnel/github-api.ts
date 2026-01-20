// extra/tunnel/github-api.ts

import https from "https";
import type { GitHubAsset, GitHubRelease, Logger } from "./types";
import { GitHubAPIError } from "./types";

/**
 * GitHub API configuration
 */
export interface GitHubAPIConfig {
  /** Repository owner/name (e.g., "playit-cloud/playit-agent") */
  repository: string;
  /** Optional custom user agent for HTTP requests */
  userAgent?: string;
  /** Optional API token for higher rate limits */
  token?: string;
  /** Base API URL (defaults to GitHub API v3) */
  baseUrl?: string;
  /** Optional logger instance */
  logger?: Logger;
}

/**
 * GitHub API Client for fetching release information
 * Uses HTTP/S for direct API calls without requiring octokit
 */
export class GitHubAPIClient {
  private readonly repository: string;
  private readonly userAgent: string;
  private readonly token?: string;
  private readonly baseUrl: string;
  private readonly logger?: Logger;

  private static readonly GITHUB_API_URL = "https://api.github.com";

  constructor(config: GitHubAPIConfig) {
    this.repository = config.repository;
    this.userAgent = config.userAgent || "minecraft-server-tunnel";
    this.token = config.token;
    this.baseUrl = config.baseUrl || GitHubAPIClient.GITHUB_API_URL;
    this.logger = config.logger;
  }

  /**
   * Fetches the latest release from GitHub API
   * @returns Promise<GitHubRelease> The latest release data
   * @throws GitHubAPIError if the API request fails
   */
  async fetchLatestRelease(): Promise<GitHubRelease> {
    const url = `${this.baseUrl}/repos/${this.repository}/releases/latest`;

    this.logger?.debug(`Fetching latest release from ${url}`);

    try {
      const response = await this.makeRequest<GitHubRelease>(url, "GET");
      this.logger?.debug(`Successfully fetched release: ${response.tag_name}`);
      return response;
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        throw error;
      }
      throw new GitHubAPIError(
        `Failed to fetch latest release: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Fetches all releases from GitHub API
   * @param perPage Number of releases per page (default: 10, max: 100)
   * @param page Page number (default: 1)
   * @returns Promise<GitHubRelease[]> Array of releases
   * @throws GitHubAPIError if the API request fails
   */
  async fetchReleases(
    perPage: number = 10,
    page: number = 1,
  ): Promise<GitHubRelease[]> {
    const url = `${this.baseUrl}/repos/${this.repository}/releases?per_page=${perPage}&page=${page}`;

    this.logger?.debug(`Fetching releases from ${url}`);

    try {
      const response = await this.makeRequest<GitHubRelease[]>(url, "GET");
      this.logger?.debug(`Successfully fetched ${response.length} releases`);
      return response;
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        throw error;
      }
      throw new GitHubAPIError(
        `Failed to fetch releases: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Fetches assets for a specific release
   * @param releaseId The release ID or tag name
   * @returns Promise<GitHubAsset[]> Array of assets
   * @throws GitHubAPIError if the API request fails
   */
  async fetchReleaseAssets(releaseId: string | number): Promise<GitHubAsset[]> {
    const url =
      typeof releaseId === "number"
        ? `${this.baseUrl}/repos/${this.repository}/releases/${releaseId}/assets`
        : `${this.baseUrl}/repos/${this.repository}/releases/tags/${releaseId}/assets`;

    this.logger?.debug(`Fetching assets from ${url}`);

    try {
      const response = await this.makeRequest<GitHubAsset[]>(url, "GET");
      this.logger?.debug(`Successfully fetched ${response.length} assets`);
      return response;
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        throw error;
      }
      throw new GitHubAPIError(
        `Failed to fetch release assets: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // github-api.ts

  /**
   * Downloads a resource from a URL using HTTPS, following redirects
   * @param url URL to download from
   * @returns Promise<Buffer> The downloaded data as a Buffer
   * @throws GitHubAPIError if the download fails
   */
  async downloadBlob(url: string): Promise<Buffer> {
    this.logger?.debug(`Downloading from ${url}`);

    return new Promise((resolve, reject) => {
      https
        .get(url, { headers: this.getRequestHeaders() }, (res) => {
          // Handle Redirects (301, 302, 307, 308)
          if (
            res.statusCode &&
            [301, 302, 307, 308].includes(res.statusCode) &&
            res.headers.location
          ) {
            this.logger?.debug(
              `Following redirect to: ${res.headers.location}`,
            );
            // Recursively call downloadBlob with the new location
            this.downloadBlob(res.headers.location).then(resolve).catch(reject);
            return;
          }

          if (res.statusCode && res.statusCode >= 400) {
            let errorBody = "";
            res.on("data", (chunk) => (errorBody += chunk));
            res.on("end", () => {
              reject(
                new GitHubAPIError(
                  `Download failed with status ${res.statusCode}`,
                  res.statusCode || undefined,
                  errorBody.substring(0, 300),
                ),
              );
            });
            return;
          }

          if (res.statusCode !== 200) {
            reject(
              new GitHubAPIError(
                `Unexpected status code: ${res.statusCode}`,
                res.statusCode || undefined,
              ),
            );
            return;
          }

          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          res.on("end", () => {
            const completeBuffer = Buffer.concat(chunks);
            this.logger?.debug(`Downloaded ${completeBuffer.length} bytes`);
            resolve(completeBuffer);
          });
        })
        .on("error", (err: Error) => {
          reject(new GitHubAPIError(`Download failed: ${err.message}`));
        });
    });
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  /**
   * Makes an HTTP(S) request to the GitHub API
   * @template T The expected response type
   * @param url The URL to request
   * @param method The HTTP method to use
   * @returns Promise<T> The parsed JSON response
   */
  private async makeRequest<T>(
    url: string,
    method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const options = {
        hostname: this.extractHostname(url),
        path: this.extractPath(url),
        method,
        headers: this.getRequestHeaders(),
      };

      https
        .request(options, (res) => {
          let rawData = "";

          if (res.statusCode && res.statusCode >= 400) {
            res.on("data", (chunk) => (rawData += chunk));
            res.on("end", () => {
              const statusCode = res.statusCode || 0;
              const responseBody = rawData.substring(0, 500);
              reject(
                new GitHubAPIError(
                  `GitHub API Error ${statusCode}: ${responseBody.replace(/\s+/g, " ").substring(0, 200)}`,
                  statusCode,
                  responseBody,
                ),
              );
            });
            return;
          }

          res.on("data", (chunk) => (rawData += chunk));
          res.on("end", () => {
            if (res.statusCode !== 200 && res.statusCode !== 201) {
              reject(
                new GitHubAPIError(
                  `Unexpected status code: ${res.statusCode}`,
                  res.statusCode || undefined,
                  rawData.substring(0, 300),
                ),
              );
              return;
            }

            try {
              const parsed = JSON.parse(rawData) as T;
              resolve(parsed);
            } catch (error) {
              reject(
                new GitHubAPIError(
                  `Failed to parse response: ${error instanceof Error ? error.message : String(error)}`,
                ),
              );
            }
          });
        })
        .on("error", (err: Error) => {
          reject(new GitHubAPIError(`Request failed: ${err.message}`));
        })
        .end();
    });
  }

  /**
   * Gets the HTTP headers for API requests
   * @returns Record of headers
   */
  private getRequestHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "User-Agent": this.userAgent,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    return headers;
  }

  /**
   * Extracts hostname from URL
   * @param url Full URL
   * @returns Hostname
   */
  private extractHostname(url: string): string {
    const match = url.match(/^https?:\/\/([^\/:?#]+)/);
    return match ? match[1]! : "";
  }

  /**
   * Extracts path from URL (includes query string)
   * @param url Full URL
   * @returns Path including query
   */
  private extractPath(url: string): string {
    const index = url.indexOf("/", 8); // Start after "https://"
    return index !== -1 ? url.substring(index) : "/";
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Creates a GitHub API client with default configuration
 * @param repository Repository owner/name (e.g., "playit-cloud/playit-agent")
 * @param config Optional additional configuration
 * @returns GitHubAPIClient instance
 */
export function createGitHubClient(
  repository: string,
  config?: Omit<GitHubAPIConfig, "repository">,
): GitHubAPIClient {
  return new GitHubAPIClient({
    repository,
    ...config,
  });
}

/**
 * Fetches the latest release from GitHub
 * @param repository Repository owner/name
 * @param config Optional configuration
 * @returns Promise<GitHubRelease> The latest release
 */
export async function fetchLatestRelease(
  repository: string,
  config?: Omit<GitHubAPIConfig, "repository">,
): Promise<GitHubRelease> {
  const client = createGitHubClient(repository, config);
  return await client.fetchLatestRelease();
}

/**
 * Fetches all releases from GitHub
 * @param repository Repository owner/name
 * @param options Optional fetch options
 * @param config Optional configuration
 * @returns Promise<GitHubRelease[]> Array of releases
 */
export async function fetchReleases(
  repository: string,
  options?: { perPage?: number; page?: number },
  config?: Omit<GitHubAPIConfig, "repository">,
): Promise<GitHubRelease[]> {
  const client = createGitHubClient(repository, config);
  return await client.fetchReleases(options?.perPage || 10, options?.page || 1);
}

// ============================================================================
// Re-exports for public API
// ============================================================================

export type { GitHubAsset, GitHubRelease } from "./types";
export { GitHubAPIError } from "./types";
