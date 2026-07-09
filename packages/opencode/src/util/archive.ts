import path from "path"
import * as Process from "./process"

export async function extractZip(zipPath: string, destDir: string) {
  if (process.platform === "win32") {
    const winZipPath = path.resolve(zipPath)
    const winDestDir = path.resolve(destDir)
    // Single-quoted PowerShell strings are literal (no $/backtick/$() interpolation),
    // so escaping ' as '' is sufficient to stop a path from breaking out of the
    // quotes and injecting commands into the -Command script.
    const psSingleQuote = (value: string) => `'${value.replace(/'/g, "''")}'`
    // $global:ProgressPreference suppresses PowerShell's blue progress bar popup
    const cmd = `$global:ProgressPreference = 'SilentlyContinue'; Expand-Archive -Path ${psSingleQuote(winZipPath)} -DestinationPath ${psSingleQuote(winDestDir)} -Force`
    await Process.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", cmd])
    return
  }

  await Process.run(["unzip", "-o", "-q", zipPath, "-d", destDir])
}

export * as Archive from "./archive"
