/**
 * Color utilities for console output
 * Provides ANSI color codes with terminal detection
 */

export const Colors = {
  // Reset
  RESET: "\x1b[0m",
  
  // Bright
  BRIGHT: "\x1b[1m",
  DIM: "\x1b[2m",
  
  // Foreground colors
  FG_RED: "\x1b[31m",
  FG_GREEN: "\x1b[32m",
  FG_YELLOW: "\x1b[33m",
  FG_BLUE: "\x1b[34m",
  FG_MAGENTA: "\x1b[35m",
  FG_CYAN: "\x1b[36m",
  FG_WHITE: "\x1b[37m",
  
  // Background colors
  BG_RED: "\x1b[41m",
  BG_GREEN: "\x1b[42m",
  BG_YELLOW: "\x1b[43m",
  BG_BLUE: "\x1b[44m",
  BG_MAGENTA: "\x1b[45m",
  BG_CYAN: "\x1b[46m",
  BG_WHITE: "\x1b[47m",
  
  // Minecraft color codes (§ to ANSI)
  MC_COLORS: {
    "§0": "\x1b[30m", // Black
    "§1": "\x1b[34m", // Dark Blue
    "§2": "\x1b[32m", // Dark Green
    "§3": "\x1b[36m", // Dark Cyan
    "§4": "\x1b[31m", // Dark Red
    "§5": "\x1b[35m", // Dark Magenta
    "§6": "\x1b[33m", // Gold
    "§7": "\x1b[37m", // Gray
    "§8": "\x1b[90m", // Dark Gray
    "§9": "\x1b[94m", // Blue
    "§a": "\x1b[92m", // Green
    "§b": "\x1b[96m", // Aqua
    "§c": "\x1b[91m", // Red
    "§d": "\x1b[95m", // Light Purple
    "§e": "\x1b[93m", // Yellow
    "§f": "\x1b[97m", // White
    "§l": "\x1b[1m",  // Bold
    "§o": "\x1b[3m",  // Italic
    "§n": "\x1b[4m",  // Underline
    "§m": "\x1b[9m",  // Strikethrough
    "§r": "\x1b[0m",  // Reset
  },
} as const;

/**
 * Check if the terminal supports colors
 */
export function supportsColor(): boolean {
  // Check common environment variables
  const term = process.env.TERM?.toLowerCase() ?? "";
  const noColor = process.env.NO_COLOR ?? "";
  const colorTerm = process.env.COLORTERM?.toLowerCase() ?? "";
  
  // Disable colors if NO_COLOR is set
  if (noColor !== "") return false;
  
  // Enable colors for known terminals
  const colorTerms = ["truecolor", "24bit", "256color", "xterm", "xterm-color"];
  if (colorTerms.some(t => colorTerm.includes(t))) return true;
  
  // Enable colors for common terminals
  const enabledTerms = ["xterm", "linux", "screen", "tmux"];
  if (enabledTerms.some(t => term.includes(t))) return true;
  
  // Check if stdout is a TTY
  return process.stdout.isTTY ?? false;
}

/**
 * Convert Minecraft color codes (§) to ANSI codes
 */
export function convertMinecraftColors(text: string): string {
  let result = text;
  for (const [mcCode, ansiCode] of Object.entries(Colors.MC_COLORS)) {
    result = result.split(mcCode).join(ansiCode);
  }
  return result;
}

/**
 * Format a message with color (prefix + message)
 */
export function colorize(
  prefix: string,
  message: string,
  prefixColor: string = Colors.FG_CYAN,
  messageColor: string = Colors.RESET
): string {
  if (!supportsColor()) {
    return `${prefix}: ${message}`;
  }
  return `${prefixColor}${prefix}${Colors.RESET} ${messageColor}${message}${Colors.RESET}`;
}

/**
 * Get colored status message
 */
export function statusColor(status: string): string {
  if (!supportsColor()) return status;
  
  switch (status) {
    case "ONLINE":
      return `${Colors.FG_GREEN}${status}${Colors.RESET}`;
    case "STARTING":
      return `${Colors.FG_YELLOW}${status}${Colors.RESET}`;
    case "STOPPING":
      return `${Colors.FG_YELLOW}${status}${Colors.RESET}`;
    case "CRASHED":
      return `${Colors.FG_RED}${status}${Colors.RESET}`;
    default:
      return `${Colors.FG_WHITE}${status}${Colors.RESET}`;
  }
}
