import { chmodSync, existsSync, mkdirSync, statSync, writeFileSync } from "fs";
import path from "path";

export interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
}

export interface GitHubRelease {
  tag_name: string;
  name: string;
  assets: GitHubAsset[];
}

export class GitHubAPIClient {
  constructor(private repo: string, private options: { token?: string, userAgent?: string } = {}) {}

  async fetchLatestRelease(): Promise<GitHubRelease> {
    const url = `https://api.github.com/repos/${this.repo}/releases/latest`;
    const headers: Record<string, string> = {
      "User-Agent": this.options.userAgent || "tunnel-client",
      "Accept": "application/vnd.github.v3+json",
    };
    if (this.options.token) headers["Authorization"] = `token ${this.options.token}`;

    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`GitHub API error: ${response.status} ${await response.text()}`);
    return await response.json() as GitHubRelease;
  }

  async downloadBlob(url: string): Promise<Uint8Array> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }
}

export class BinaryManager {
  private archMap: Record<string, string> = {
    x64: "x86_64",
    arm64: "aarch64",
    arm: "armv7",
    ia32: "i686",
  };

  private osPrefixes: Record<string, string> = {
    linux: "playit-linux-",
    darwin: "playit-macos-",
    win32: "playit-windows-",
  };

  constructor(private dataDir: string, private token?: string) {
    if (!existsSync(this.dataDir)) mkdirSync(this.dataDir, { recursive: true });
  }

  async ensureBinary(): Promise<string> {
    const platform = process.platform;
    const arch = process.arch;
    const prefix = this.osPrefixes[platform];
    const playitArch = this.archMap[arch];

    if (!prefix || !playitArch) throw new Error(`Unsupported platform/arch: ${platform}/${arch}`);

    const client = new GitHubAPIClient("playit-cloud/playit-agent", { token: this.token });
    const release = await client.fetchLatestRelease();
    
    const asset = release.assets.find(a => {
      const name = a.name.toLowerCase();
      return name.includes(prefix) && name.includes(playitArch) && !name.includes("signed") && !name.includes("debug");
    });

    if (!asset) throw new Error(`No compatible binary found for ${platform}/${arch}`);

    const binaryPath = path.join(this.dataDir, platform === "win32" ? "playit.exe" : "playit");

    if (existsSync(binaryPath)) {
      const stats = statSync(binaryPath);
      if (stats.size === asset.size) return binaryPath;
    }

    const data = await client.downloadBlob(asset.browser_download_url);
    writeFileSync(binaryPath, data);
    if (platform !== "win32") chmodSync(binaryPath, 0o755);

    return binaryPath;
  }
}
