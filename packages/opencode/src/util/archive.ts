import path from "path"
import * as Process from "./process"

export async function extractZip(zipPath: string, destDir: string) {
  if (process.platform === "win32") {
    const winZipPath = path.resolve(zipPath)
    const winDestDir = path.resolve(destDir)
    const script = `$global:ProgressPreference = 'SilentlyContinue'; Expand-Archive -LiteralPath '${winZipPath.replace(/'/g, "''")}' -DestinationPath '${winDestDir.replace(/'/g, "''")}' -Force`
    const encoded = Buffer.from(script, "utf16le").toString("base64")
    await Process.run(["powershell", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded])
    return
  }

  await Process.run(["unzip", "-o", "-q", zipPath, "-d", destDir])
}

export * as Archive from "./archive"
