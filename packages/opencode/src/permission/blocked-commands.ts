/**
 * Blocked Command Registry - Dangerous Command Detection
 * 
 * Implements pattern matching for dangerous commands that should be blocked
 * or require additional approval based on approval mode.
 */

/**
 * Destructive command patterns - blocked even in YOLO mode
 * These commands can cause irreversible system damage
 */
export const DESTRUCTIVE_PATTERNS = [
  // System-wide deletion
  /\brm\s+-rf\s+\/\s*$/,
  /\brm\s+-rf\s+\/\*/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\bformat\s+[A-Z]:/i,
  /\bdiskpart\b/,
  /\bfdisk\b/,
  // Dangerous disk operations
  /\bdiskutil\s+eraseDisk\b/,
  /\bshred\s+-/,
  // System directory deletion
  /\brm\s+.*\/etc\/\*$/,
  /\brm\s+.*\/bin\/\*$/,
  /\brm\s+.*\/sbin\/\*$/,
] as const

/**
 * Network command patterns - blocked in Autopilot mode
 * These commands can expose data or connect to external services
 */
export const NETWORK_PATTERNS = [
  /\bcurl\b/,
  /\bwget\b/,
  /\bgit\s+push\b/,
  /\bgit\s+fetch\b/,
  /\bscp\b/,
  /\bssh\b/,
  /\bftp\b/,
  /\bsftp\b/,
  /\bnc\s+-.*-.*\d+/,
  /\bnetcat\b/,
  /\bncat\b/,
  /\bnpm\s+publish\b/,
  /\byarn\s+publish\b/,
  /\bpnpm\s+publish\b/,
] as const

/**
 * System-level package installation patterns - blocked in Autopilot mode
 * These commands modify the system environment
 */
export const SYSTEM_INSTALL_PATTERNS = [
  /\bapt\s+install\b/,
  /\bapt-get\s+install\b/,
  /\bapt\s+remove\b/,
  /\bapt-get\s+remove\b/,
  /\bbrew\s+install\b/,
  /\bbrew\s+cask\s+install\b/,
  /\byum\s+install\b/,
  /\byum\s+remove\b/,
  /\bdnf\s+install\b/,
  /\bdnf\s+remove\b/,
  /\bpacman\s+-S\b/,
  /\bpacman\s+-R\b/,
  /\bpkg\s+install\b/,
  /\bpip\s+install\s+--system\b/,
  /\bchoco\s+install\b/,
  /\bchoco\s+uninstall\b/,
] as const

/**
 * Category type for blocked commands
 */
export type BlockedCategory = "destructive" | "network" | "system_install"

/**
 * Blocked command match result
 */
export interface BlockedCommand {
  category: BlockedCategory
  pattern: RegExp
  matchedText: string
  lineNumber: number
}

/**
 * Analyze a command string for blocked patterns
 * @param command - The command to analyze
 * @param categories - Which categories to check (default: all)
 * @returns Array of matched blocked commands
 */
export function analyzeCommand(
  command: string,
  categories: BlockedCategory[] = ["destructive", "network", "system_install"],
): BlockedCommand[] {
  const results: BlockedCommand[] = []
  
  // Check destructive patterns
  if (categories.includes("destructive")) {
    for (const pattern of DESTRUCTIVE_PATTERNS) {
      if (pattern.test(command)) {
        results.push({
          category: "destructive",
          pattern,
          matchedText: command,
          lineNumber: 1,
        })
      }
    }
  }
  
  // Check network patterns
  if (categories.includes("network")) {
    for (const pattern of NETWORK_PATTERNS) {
      if (pattern.test(command)) {
        results.push({
          category: "network",
          pattern,
          matchedText: command,
          lineNumber: 1,
        })
      }
    }
  }
  
  // Check system install patterns
  if (categories.includes("system_install")) {
    for (const pattern of SYSTEM_INSTALL_PATTERNS) {
      if (pattern.test(command)) {
        results.push({
          category: "system_install",
          pattern,
          matchedText: command,
          lineNumber: 1,
        })
      }
    }
  }
  
  return results
}

/**
 * Analyze script content line by line for blocked patterns
 * @param content - Script content to analyze
 * @param categories - Which categories to check
 * @returns Array of matched blocked commands with line numbers
 */
export function analyzeScript(
  content: string,
  categories: BlockedCategory[] = ["destructive", "network", "system_install"],
): BlockedCommand[] {
  // Check for binary or encrypted content
  if (isBinaryOrEncrypted(content)) {
    return [
      {
        category: "destructive",
        pattern: /BINARY_OR_ENCRYPTED/,
        matchedText: "Binary or encrypted script content detected",
        lineNumber: 0,
      },
    ]
  }
  
  const lines = content.split("\n")
  const results: BlockedCommand[] = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    
    // Skip empty lines and comments
    if (line.length === 0 || line.startsWith("#")) {
      continue
    }
    
    // Check each category
    if (categories.includes("destructive")) {
      for (const pattern of DESTRUCTIVE_PATTERNS) {
        if (pattern.test(line)) {
          results.push({
            category: "destructive",
            pattern,
            matchedText: line,
            lineNumber: i + 1,
          })
        }
      }
    }
    
    if (categories.includes("network")) {
      for (const pattern of NETWORK_PATTERNS) {
        if (pattern.test(line)) {
          results.push({
            category: "network",
            pattern,
            matchedText: line,
            lineNumber: i + 1,
          })
        }
      }
    }
    
    if (categories.includes("system_install")) {
      for (const pattern of SYSTEM_INSTALL_PATTERNS) {
        if (pattern.test(line)) {
          results.push({
            category: "system_install",
            pattern,
            matchedText: line,
            lineNumber: i + 1,
          })
        }
      }
    }
  }
  
  return results
}

/**
 * Check if content appears to be binary or encrypted
 * @param content - Content to check
 * @returns True if binary or encrypted
 */
function isBinaryOrEncrypted(content: string): boolean {
  // Check for high ratio of non-printable characters
  const printable = content.match(/[\x20-\x7E\s]/g) || []
  const ratio = printable.length / content.length
  
  // If less than 10% printable characters, likely binary
  if (content.length > 100 && ratio < 0.1) {
    return true
  }
  
  // Check for common binary signatures
  const binarySignatures = [
    "\x00\x00", // Null bytes often in binary
    "\x7FELF",  // ELF binary
    "MZ",       // Windows executable
    "PK\x03\x04", // ZIP/PK
  ]
  
  for (const sig of binarySignatures) {
    if (content.includes(sig)) {
      return true
    }
  }
  
  return false
}

/**
 * Check if a command is safe (doesn't match any blocked patterns)
 * @param command - Command to check
 * @returns True if no blocked patterns matched
 */
export function isSafeCommand(command: string): boolean {
  return analyzeCommand(command).length === 0
}

/**
 * Check if a command is destructive
 * @param command - Command to check
 * @returns True if matches destructive patterns
 */
export function isDestructiveCommand(command: string): boolean {
  return analyzeCommand(command, ["destructive"]).length > 0
}

/**
 * Check if a command involves network operations
 * @param command - Command to check
 * @returns True if matches network patterns
 */
export function isNetworkCommand(command: string): boolean {
  return analyzeCommand(command, ["network"]).length > 0
}

/**
 * Check if a command is system installation
 * @param command - Command to check
 * @returns True if matches system install patterns
 */
export function isSystemInstallCommand(command: string): boolean {
  return analyzeCommand(command, ["system_install"]).length > 0
}

/**
 * Get human-readable description of blocked command
 * @param blocked - Blocked command info
 * @returns Description string
 */
export function getBlockedDescription(blocked: BlockedCommand): string {
  switch (blocked.category) {
    case "destructive":
      return `Destructive command detected at line ${blocked.lineNumber}: "${blocked.matchedText.slice(0, 50)}"`
    case "network":
      return `Network command detected at line ${blocked.lineNumber}: "${blocked.matchedText.slice(0, 50)}"`
    case "system_install":
      return `System installation detected at line ${blocked.lineNumber}: "${blocked.matchedText.slice(0, 50)}"`
    default:
      return `Blocked command at line ${blocked.lineNumber}: "${blocked.matchedText.slice(0, 50)}"`
  }
}

/**
 * Safe command allowlist for Default mode
 * These commands are automatically approved
 */
export const DEFAULT_ALLOWLIST = [
  /^\s*ls\s*/,
  /^\s*cat\s*/,
  /^\s*grep\s*/,
  /^\s*find\s*/,
  /^\s*bun\s+test\s*/,
  /^\s*bun\s+typecheck\s*/,
  /^\s*npm\s+run\s+(lint|test|typecheck|build|dev)\s*/,
  /^\s*pnpm\s+(test|lint|typecheck|build)\s*/,
  /^\s*yarn\s+(test|lint|typecheck|build)\s*/,
  /^\s*git\s+(status|log|show|diff|branch)\s*/,
  /^\s*echo\s*/,
  /^\s*mkdir\s+-(p|parents)\s*/,
  /^\s*cd\s*/,
  /^\s*pwd\s*/,
  /^\s*which\s*/,
  /^\s*where\s*/,
]

/**
 * Check if a command matches the allowlist
 * @param command - Command to check
 * @returns True if allowed
 */
export function matchesAllowlist(command: string): boolean {
  return DEFAULT_ALLOWLIST.some((pattern) => pattern.test(command))
}

/**
 * Get categories that should be checked for a given approval mode
 * @param mode - Approval mode
 * @returns Array of categories to check
 */
export function getCategoriesForMode(
  mode: "default" | "autopilot" | "yolo",
): BlockedCategory[] {
  switch (mode) {
    case "yolo":
      return ["destructive"] // Only destructive in YOLO
    case "autopilot":
      return ["destructive", "network", "system_install"]
    case "default":
    default:
      return [] // Allowlist-based in Default
  }
}
