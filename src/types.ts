import type { Subprocess } from "bun";
export type GuardianProcess = Subprocess<"pipe", "pipe", "pipe">;
import type { Guardian } from "./guardian"; // Ajusta el import según tu estructura

export interface GuardianPlugin {
  name: string;
  version: string;
  onLoad(guardian: Guardian): void;
  onUnload?(): void;
}
export type GuardianStatus =
  | "OFFLINE"
  | "STARTING"
  | "ONLINE"
  | "STOPPING"
  | "CRASHED";

export interface ExitEvent {
  code: number | null;
  isCrash: boolean;
  reason: string;
}

export interface ServerConfig {
  jarPath: string;
  javaBin: string; // Ruta al ejecutable de java
  jvmOptions: string[]; // Ej: -Xmx4G
  programArgs: string[]; // Ej: nogui
  port: number;
  cwd: string; // Directorio de trabajo
  javaVersion: number; // Preferred Java version (e.g., 21)
  core: string; // Preferred server core (e.g., "paper")
  coreVersion: string; // Preferred core version (e.g., "1.21.1")
}

export interface GuardianConfig {
  autoRestart: boolean;
  maxRetries: number;
  retryDelayMs: number;
  paths: {
    logs: string;
    backups: string;
    data: string;
    [key: string]: string;
  };
}

export interface SystemStats {
  cpu: number;
  memory: number;
  uptime: number;
}

export interface LogRule {
  name: string;
  regex: RegExp;
  handler: (groups: Record<string, string>) => void;
}
