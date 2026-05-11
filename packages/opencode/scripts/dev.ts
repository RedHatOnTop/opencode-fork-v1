import { spawn } from "child_process"
import path from "path"
import process from "process"

const callerCwd = process.env.OPENCODE_DEV_CWD || process.cwd()
const scriptDir = path.dirname(
  import.meta.url.replace(/^file:\/\/\//, "").replace(/\//g, path.sep),
)
const pkgDir = path.resolve(scriptDir, "..")
const entry = path.resolve(pkgDir, "src", "index.ts")

const child = spawn(
  process.execPath,
  [
    "--conditions=browser",
    entry,
    ...process.argv.slice(2),
  ],
  {
    stdio: "inherit",
    cwd: pkgDir,
    env: {
      ...process.env,
      OPENCODE_DEV_CWD: callerCwd,
    },
  },
)

child.on("exit", (code) => {
  process.exit(code ?? 0)
})
