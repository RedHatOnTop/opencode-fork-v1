import { expect, test } from "bun:test"
import { convertClaudeMcpEntry } from "@/mcp/claude-code-sources"

test("converts a local stdio server {command, args, env} to opencode local config", () => {
  const result = convertClaudeMcpEntry({
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "tok" },
  })
  expect(result).toEqual({
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-github"],
    environment: { GITHUB_PERSONAL_ACCESS_TOKEN: "tok" },
  })
})

test("converts a bare string entry to a remote server", () => {
  const result = convertClaudeMcpEntry("https://mcp.example.com/sse")
  expect(result).toEqual({ type: "remote", url: "https://mcp.example.com/sse" })
})

test("converts a remote entry with url and headers", () => {
  const result = convertClaudeMcpEntry({
    url: "https://mcp.example.com",
    headers: { Authorization: "Bearer x" },
  })
  expect(result).toEqual({
    type: "remote",
    url: "https://mcp.example.com",
    headers: { Authorization: "Bearer x" },
  })
})

test("local command without args still produces a single-element command array", () => {
  const result = convertClaudeMcpEntry({ command: "node" })
  expect(result).toEqual({ type: "local", command: ["node"] })
})

test("preserves cwd and timeout on a local entry", () => {
  const result = convertClaudeMcpEntry({ command: "uvx", args: ["server"], cwd: "./srv", timeout: 10000 })
  expect(result).toEqual({
    type: "local",
    command: ["uvx", "server"],
    cwd: "./srv",
    timeout: 10000,
  })
})

test("skips an entry explicitly disabled via enabled:false", () => {
  expect(convertClaudeMcpEntry({ command: "npx", enabled: false })).toBeUndefined()
})

test("skips an entry explicitly disabled via disabled:true", () => {
  expect(convertClaudeMcpEntry({ command: "npx", disabled: true })).toBeUndefined()
})

test("skips a local entry with an empty command", () => {
  expect(convertClaudeMcpEntry({ command: "", args: ["x"] })).toBeUndefined()
})

test("skips an empty string URL", () => {
  expect(convertClaudeMcpEntry("")).toBeUndefined()
})

test("skips an object with neither command nor url", () => {
  expect(convertClaudeMcpEntry({ description: "no server here" })).toBeUndefined()
})
