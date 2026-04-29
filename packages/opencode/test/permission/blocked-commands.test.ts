/**
 * Blocked Command Registry Tests
 * 
 * Tests for dangerous command pattern matching and script analysis.
 * Property: Dangerous command strings match correct category patterns.
 */

import { describe, expect, it } from "bun:test"
import {
  DESTRUCTIVE_PATTERNS,
  NETWORK_PATTERNS,
  SYSTEM_INSTALL_PATTERNS,
  analyzeCommand,
  analyzeScript,
  isSafeCommand,
  isDestructiveCommand,
  isNetworkCommand,
  isSystemInstallCommand,
  matchesAllowlist,
  type BlockedCategory,
} from "@/permission/blocked-commands"

describe("Blocked Commands", () => {
  describe("Destructive Command Detection", () => {
    const destructiveCommands = [
      "rm -rf /",
      "rm -rf /*",
      "sudo rm -rf /",
      "rm -rf /etc/*",
      "rm -rf /bin/*",
      "mkfs.ext4 /dev/sda1",
      "mkfs -t ext4 /dev/sda1",
      "dd if=/dev/zero of=/dev/sda",
      "format C:",
      "diskpart /clean",
      "fdisk /dev/sda",
      "diskutil eraseDisk JHFS+ Untitled disk1",
      "shred -z -n 3 /path/to/file",
    ]

    for (const cmd of destructiveCommands) {
      it(`should detect destructive command: "${cmd}"`, () => {
        const results = analyzeCommand(cmd, ["destructive"])
        expect(results.length).toBeGreaterThan(0)
        expect(results.some((r) => r.category === "destructive")).toBe(true)
      })
    }

    it("should identify destructive commands correctly", () => {
      for (const cmd of destructiveCommands) {
        expect(isDestructiveCommand(cmd)).toBe(true)
      }
    })
  })

  describe("Network Command Detection", () => {
    const networkCommands = [
      "curl https://example.com",
      "wget https://example.com/file",
      "git push origin main",
      "git fetch origin",
      "scp file.txt user@host:/path",
      "ssh user@host",
      "ftp example.com",
      "sftp user@host",
      "nc -l -p 8080",
      "netcat -l -p 8080",
      "ncat -l -p 8080",
      "npm publish",
    ]

    for (const cmd of networkCommands) {
      it(`should detect network command: "${cmd}"`, () => {
        const results = analyzeCommand(cmd, ["network"])
        expect(results.length).toBeGreaterThan(0)
        expect(results.some((r) => r.category === "network")).toBe(true)
      })
    }

    it("should identify network commands correctly", () => {
      for (const cmd of networkCommands) {
        expect(isNetworkCommand(cmd)).toBe(true)
      }
    })
  })

  describe("System Install Command Detection", () => {
    const installCommands = [
      "apt install package",
      "apt-get install package",
      "apt remove package",
      "brew install formula",
      "brew cask install app",
      "yum install package",
      "yum remove package",
      "dnf install package",
      "pacman -S package",
      "pacman -R package",
      "pkg install package",
      "pip install --system package",
      "choco install package",
    ]

    for (const cmd of installCommands) {
      it(`should detect install command: "${cmd}"`, () => {
        const results = analyzeCommand(cmd, ["system_install"])
        expect(results.length).toBeGreaterThan(0)
        expect(results.some((r) => r.category === "system_install")).toBe(true)
      })
    }

    it("should identify system install commands correctly", () => {
      for (const cmd of installCommands) {
        expect(isSystemInstallCommand(cmd)).toBe(true)
      }
    })
  })

  describe("Safe Command Detection", () => {
    const safeCommands = [
      "ls -la",
      "cat file.txt",
      "grep pattern file",
      "find . -name '*.ts'",
      "bun test",
      "npm run lint",
      "git status",
      "git log",
      "git diff",
      "echo hello",
      "mkdir -p path/to/dir",
      "cd /path/to/dir",
      "pwd",
      "which node",
    ]

    for (const cmd of safeCommands) {
      it(`should not flag safe command: "${cmd}"`, () => {
        const results = analyzeCommand(cmd)
        expect(results.length).toBe(0)
        expect(isSafeCommand(cmd)).toBe(true)
      })
    }
  })

  describe("Allowlist Matching", () => {
    const allowlistedCommands = [
      "ls -la",
      "cat file.txt",
      "grep pattern file",
      "find . -name '*.ts'",
      "bun test",
      "bun typecheck",
      "npm run lint",
      "npm run test",
      "pnpm test",
      "yarn build",
      "git status",
      "git log --oneline",
      "git diff HEAD",
      "echo hello world",
      "mkdir -p path/to/dir",
      "cd /some/path",
      "pwd",
      "which node",
      "where python",
    ]

    for (const cmd of allowlistedCommands) {
      it(`should match allowlist for: "${cmd}"`, () => {
        expect(matchesAllowlist(cmd)).toBe(true)
      })
    }

    const nonAllowlistedCommands = [
      "rm -rf /",
      "curl https://example.com",
      "apt install package",
      "npm publish",
    ]

    for (const cmd of nonAllowlistedCommands) {
      it(`should not match allowlist for: "${cmd}"`, () => {
        expect(matchesAllowlist(cmd)).toBe(false)
      })
    }
  })

  describe("Script Analysis", () => {
    it("should analyze script with multiple dangerous commands", () => {
      const script = `
#!/bin/bash
# This is a comment
echo "Starting..."
curl https://example.com
rm -rf /tmp/old
curl https://api.example.com
echo "Done"
`
      const results = analyzeScript(script)
      expect(results.length).toBeGreaterThanOrEqual(2)
      expect(results.some((r) => r.category === "network" && r.matchedText.includes("curl"))).toBe(true)
    })

    it("should skip comments in script analysis", () => {
      const script = `
#!/bin/bash
# curl https://evil.com
# rm -rf /
echo "Safe"
`
      const results = analyzeScript(script)
      expect(results.length).toBe(0)
    })

    it("should detect empty lines correctly", () => {
      const script = `


curl https://example.com

`
      const results = analyzeScript(script)
      expect(results.length).toBe(1)
      expect(results[0].lineNumber).toBe(4)
    })

    it("should detect binary-like content", () => {
      const binaryContent = Buffer.alloc(100)
      binaryContent.write("\x00\x00\x7FELF", 0)
      const results = analyzeScript(binaryContent.toString())
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].matchedText).toInclude("Binary or encrypted")
    })

    it("should handle scripts with multiple categories", () => {
      const script = `
#!/bin/bash
# Install dependencies
apt-get install curl
# Download something
curl -O https://example.com/file
# Cleanup
rm -rf /tmp/downloads
`
      const results = analyzeScript(script)
      expect(results.some((r) => r.category === "system_install")).toBe(true)
      expect(results.some((r) => r.category === "network")).toBe(true)
      expect(results.some((r) => r.category === "destructive")).toBe(false) // rm /tmp is not destructive
    })
  })

  describe("Edge Cases", () => {
    it("should handle empty script", () => {
      const results = analyzeScript("")
      expect(results).toBeEmpty()
    })

    it("should handle script with only comments", () => {
      const results = analyzeScript("# Comment 1\n# Comment 2")
      expect(results).toBeEmpty()
    })

    it("should handle script with only whitespace", () => {
      const results = analyzeScript("   \n\t\n   ")
      expect(results).toBeEmpty()
    })

    it("should handle commands with unusual formatting", () => {
      const results = analyzeCommand("  curl   https://example.com  ")
      expect(results.length).toBeGreaterThan(0)
    })

    it("should preserve line numbers correctly", () => {
      const script = `echo 1
echo 2
curl https://example.com
echo 4`
      const results = analyzeScript(script)
      expect(results[0].lineNumber).toBe(3)
    })
  })
})
