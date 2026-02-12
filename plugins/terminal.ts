import type { IPlugin, PluginContext, AppEvents } from "bun_plugins";

/**
 * Terminal output plugin constants
 */
const TerminalPluginConstants = {
  NAME: "terminal-output",
  VERSION: "1.0.0",
  DESCRIPTION: "Terminal output formatting plugin with colors and timestamps",
  AUTHOR: "Guardian Team",
} as const;

/**
 * ANSI color codes for terminal output
 */
const TERMINAL_COLORS = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  reset: "\x1b[0m",
  bright: "\x1b[1m",
} as const;

type TerminalColorName = keyof typeof TERMINAL_COLORS;

/**
 * Log levels for terminal output
 */
const LogLevels = {
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
  DEBUG: "DEBUG",
  STATUS: "STATUS",
} as const;

type LogLevel = (typeof LogLevels)[keyof typeof LogLevels];

/**
 * Interface for terminal plugin events
 */
interface TerminalPluginEvents {
  formatted: { level: LogLevel; message: string; timestamp: string };
  log: string;
  error: string;
}

/**
 * Clean ANSI escape codes from terminal output
 */
const cleanAnsiOutput = (message: string): string | null => {
  if (!message) return null;

  let clean = message.replace(/\x1B][^]*?(\x07|\x1B\\)/g, "");
  clean = clean.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
  clean = clean.replace(/[\u2500-\u257f]/g, "");
  clean = clean.replace(/[\x00-\x09\x0B-\x1F]/g, "");
  clean = clean.replace(/\r\n/g, "\n");
  clean = clean.replace(/\r/g, "");
  clean = clean.trim();

  if (clean.length === 0) return null;

  return clean;
};

/**
 * Get color for log level
 */
const getLevelColor = (level: LogLevel): TerminalColorName => {
  switch (level) {
    case LogLevels.ERROR:
      return "red";
    case LogLevels.WARN:
      return "yellow";
    case LogLevels.DEBUG:
      return "cyan";
    case LogLevels.STATUS:
      return "magenta";
    case LogLevels.INFO:
    default:
      return "green";
  }
};

/**
 * Format terminal output with timestamp, level, and color
 */
const formatTerminalOutput = (
  level: LogLevel,
  message: string,
  source?: string
): string | null => {
  const cleanedMessage = cleanAnsiOutput(message);
  if (!cleanedMessage) return null;

  const timestamp = new Date().toLocaleTimeString();
  const color = getLevelColor(level);
  const ansi = TERMINAL_COLORS[color];
  const reset = TERMINAL_COLORS.reset;

  if (source) {
    return ansi + "[" + timestamp + "] [" + level + "] [" + source + "]" + reset + " " + cleanedMessage;
  }
  return ansi + "[" + timestamp + "] [" + level + "]" + reset + " " + cleanedMessage;
};

/**
 * Simple logger for the terminal plugin
 */
class TerminalLogger {
  private static instance: TerminalLogger;
  private context?: PluginContext;

  private constructor() {}

  static getInstance(): TerminalLogger {
    if (!TerminalLogger.instance) {
      TerminalLogger.instance = new TerminalLogger();
    }
    return TerminalLogger.instance;
  }

  setContext(context: PluginContext) {
    this.context = context;
  }

  public log(level: LogLevel, message: string, source?: string) {
    const formatted = formatTerminalOutput(level, message, source);
    if (formatted) {
      console.log(formatted);
    }
  }

  status(message: string, source?: string) {
    this.log(LogLevels.STATUS, message, source);
  }

  info(message: string, source?: string) {
    this.log(LogLevels.INFO, message, source);
  }

  warn(message: string, source?: string) {
    this.log(LogLevels.WARN, message, source);
  }

  error(message: string, source?: string) {
    this.log(LogLevels.ERROR, message, source);
  }

  debug(message: string, source?: string) {
    this.log(LogLevels.DEBUG, message, source);
  }
}

/**
 * Terminal Output Plugin
 * Provides formatted terminal output with colors, timestamps, and log levels
 */
export class TerminalPlugin implements IPlugin {
  name = TerminalPluginConstants.NAME;
  version = TerminalPluginConstants.VERSION;
  description = TerminalPluginConstants.DESCRIPTION;
  author = TerminalPluginConstants.AUTHOR;

  private context!: PluginContext;
  private logger = TerminalLogger.getInstance();

  onLoad(context: PluginContext): void {
    this.context = context;
    this.logger.setContext(context);

    // Register event handlers for formatted output
    this.registerEventHandlers();
  }

  onUnload(): void {
    console.log(this.name + " v" + this.version + " onUnload");
  }

  private registerEventHandlers(): void {
    // Handle log events from the system
    this.context.on("log" as keyof AppEvents, (payload: unknown) => {
      this.handleLogEvent(payload);
    });

    // Handle error events
    this.context.on("error" as keyof AppEvents, (payload: unknown) => {
      this.handleErrorEvent(payload);
    });

    // Handle output events (Minecraft server output)
    this.context.on("output" as keyof AppEvents, (payload: unknown) => {
      this.handleOutputEvent(payload);
    });

    // Handle status events
    this.context.on("status" as keyof AppEvents, (payload: unknown) => {
      this.handleStatusEvent(payload);
    });
  }

  private handleLogEvent(payload: unknown): void {
    const message = typeof payload === "string" ? payload : String(payload);
    this.logger.info(message, "System");
  }

  private handleErrorEvent(payload: unknown): void {
    const message = typeof payload === "string" ? payload : String(payload);
    this.logger.error(message, "Error");
  }

  private handleOutputEvent(payload: unknown): void {
    const message = typeof payload === "string" ? payload : String(payload);
    
    // Detect log level from Minecraft server output
    const level = this.detectLogLevel(message);
    
    // Format and output
    const formatted = formatTerminalOutput(level, message, "Server");
    if (formatted) {
      console.log(formatted);
    }
  }

  private handleStatusEvent(payload: unknown): void {
    const status = typeof payload === "string" ? payload : String(payload);
    this.logger.log(LogLevels.STATUS, `Server status changed to: ${status}`, "Guardian");
  }

  /**
   * Detect log level from Minecraft server log message
   */
  private detectLogLevel(message: string): LogLevel {
    if (message.includes("[WARN]") || message.includes("WARN") || message.includes("Warning")) {
      return LogLevels.WARN;
    }
    if (message.includes("[ERROR]") || message.includes("ERROR") || message.includes("Error")) {
      return LogLevels.ERROR;
    }
    if (message.includes("[DEBUG]") || message.includes("DEBUG")) {
      return LogLevels.DEBUG;
    }
    return LogLevels.INFO;
  }

  /**
   * Get the terminal logger instance for external use
   */
  getLogger() {
    return this.logger;
  }
}
