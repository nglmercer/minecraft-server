import path from "node:path";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "bun";

export type BackupListEntry = {
  name: string;
  size: number;
  modifiedAtMs: number;
  modifiedAt: string;
};

export type RestoreResult = {
  name: string;
  restoredAt: string;
};

export class BackupManager {
  constructor(
    private readonly opts: {
      backupsDir: string;
      serverDir: string;
    },
  ) {}

  private jsonError(message: string, status = 400): Response {
    return Response.json({ success: false, error: message }, { status });
  }

  private async ensureBackupsDir(): Promise<void> {
    await mkdir(this.opts.backupsDir, { recursive: true });
  }

  private sanitizeBackupName(name: string): string {
    const normalized = String(name ?? "").replace(/\\/g, "/").trim();
    const base = path.posix.basename(normalized);

    if (!base || base === "." || base === "..") {
      throw new Error("Invalid backup name");
    }

    if (!base.endsWith(".tar.gz")) {
      throw new Error("Backup must be a .tar.gz file");
    }

    return base;
  }

  private resolveBackupPath(name: string): { safeName: string; fullPath: string } {
    const safeName = this.sanitizeBackupName(name);
    return { safeName, fullPath: path.join(this.opts.backupsDir, safeName) };
  }

  async listBackups(): Promise<BackupListEntry[]> {
    await this.ensureBackupsDir();

    const entries = await readdir(this.opts.backupsDir, { withFileTypes: true });
    const backups: BackupListEntry[] = [];

    for (const e of entries) {
      if (!e.isFile()) continue;
      if (!e.name.endsWith(".tar.gz")) continue;

      const p = path.join(this.opts.backupsDir, e.name);
      const s = await stat(p);

      backups.push({
        name: e.name,
        size: s.size,
        modifiedAtMs: s.mtimeMs,
        modifiedAt: s.mtime.toISOString(),
      });
    }

    backups.sort((a, b) => b.modifiedAtMs - a.modifiedAtMs);
    return backups;
  }

  async uploadBackup(file: File, requestedName?: string): Promise<BackupListEntry> {
    await this.ensureBackupsDir();

    const rawName = (requestedName && requestedName.trim().length > 0) ? requestedName : file.name;
    const safeName = this.sanitizeBackupName(rawName);

    let destPath = path.join(this.opts.backupsDir, safeName);
    if (existsSync(destPath)) {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const withoutExt = safeName.slice(0, -".tar.gz".length);
      destPath = path.join(this.opts.backupsDir, `${withoutExt}-${ts}.tar.gz`);
    }

    await Bun.write(destPath, file);

    const s = await stat(destPath);
    return {
      name: path.basename(destPath),
      size: s.size,
      modifiedAtMs: s.mtimeMs,
      modifiedAt: s.mtime.toISOString(),
    };
  }

  async createDownloadResponse(name: string): Promise<Response> {
    try {
      const { safeName, fullPath } = this.resolveBackupPath(name);

      if (!existsSync(fullPath)) {
        return this.jsonError("Backup not found", 404);
      }

      const file = Bun.file(fullPath);
      return new Response(file, {
        headers: {
          "Content-Type": "application/gzip",
          "Content-Disposition": `attachment; filename="${safeName}"`,
        },
      });
    } catch (e) {
      return this.jsonError(e instanceof Error ? e.message : String(e), 400);
    }
  }

  private async extractTarGz(archivePath: string, destDir: string): Promise<void> {
    const tarExe = process.platform === "win32" ? "tar.exe" : "tar";

    const proc = spawn([tarExe, "-xzf", archivePath, "-C", destDir], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const [exitCode, stderr] = await Promise.all([
      proc.exited,
      proc.stderr ? new Response(proc.stderr).text() : Promise.resolve(""),
    ]);

    if (exitCode !== 0) {
      throw new Error(stderr?.trim() ? `tar failed: ${stderr.trim()}` : `tar failed with code ${exitCode}`);
    }
  }

  async restoreBackup(name: string): Promise<RestoreResult> {
    const { safeName, fullPath } = this.resolveBackupPath(name);

    if (!existsSync(fullPath)) {
      throw new Error("Backup not found");
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const tempDir = path.join(this.opts.backupsDir, `.restore-tmp-${ts}`);
    let previousDir: string | null = null;

    await mkdir(tempDir, { recursive: true });

    try {
      await this.extractTarGz(fullPath, tempDir);

      await mkdir(path.dirname(this.opts.serverDir), { recursive: true });

      if (existsSync(this.opts.serverDir)) {
        previousDir = `${this.opts.serverDir}.before-restore.${ts}`;
        await rename(this.opts.serverDir, previousDir);
      }

      await rename(tempDir, this.opts.serverDir);

      if (previousDir) {
        await rm(previousDir, { recursive: true, force: true });
      }

      return {
        name: safeName,
        restoredAt: new Date().toISOString(),
      };
    } catch (e) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});

      if (previousDir && !existsSync(this.opts.serverDir) && existsSync(previousDir)) {
        await rename(previousDir, this.opts.serverDir).catch(() => {});
      }

      throw e;
    }
  }
}
