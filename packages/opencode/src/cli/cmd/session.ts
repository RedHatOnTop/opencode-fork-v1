import type { Argv } from "yargs"
import { Effect } from "effect"
import { cmd } from "./cmd"
import { effectCmd, fail } from "../effect-cmd"
import { Session } from "@/session/session"
import { SessionID } from "../../session/schema"
import { UI } from "../ui"
import { Locale } from "@/util/locale"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Filesystem } from "@/util/filesystem"
import { Process } from "@/util/process"
import { NotFoundError } from "@/storage/storage"
import { EOL } from "os"
import path from "path"
import { which } from "../../util/which"
import { AppRuntime } from "@/effect/app-runtime"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "session-cmd" })

function pagerCmd(): string[] {
  const lessOptions = ["-R", "-S"]
  if (process.platform !== "win32") {
    return ["less", ...lessOptions]
  }

  // user could have less installed via other options
  const lessOnPath = which("less")
  if (lessOnPath) {
    if (Filesystem.stat(lessOnPath)?.size) return [lessOnPath, ...lessOptions]
  }

  if (Flag.OPENCODE_GIT_BASH_PATH) {
    const less = path.join(Flag.OPENCODE_GIT_BASH_PATH, "..", "..", "usr", "bin", "less.exe")
    if (Filesystem.stat(less)?.size) return [less, ...lessOptions]
  }

  const git = which("git")
  if (git) {
    const less = path.join(git, "..", "..", "usr", "bin", "less.exe")
    if (Filesystem.stat(less)?.size) return [less, ...lessOptions]
  }

  // Fall back to Windows built-in more (via cmd.exe)
  return ["cmd", "/c", "more"]
}

export const SessionCommand = cmd({
  command: "session",
  describe: "manage sessions",
  builder: (yargs: Argv) =>
    yargs
      .command(SessionListCommand)
      .command(SessionDeleteCommand)
      .command(SessionResumeCommand)
      .demandCommand(),
  async handler() {},
})

/**
 * /session resume — Resume a previous session
 *
 * Spec ref: opencode-enhanced R25
 */
export const SessionResumeCommand = cmd({
  command: "resume [sessionID]",
  describe: "resume a previous session",
  builder: (yargs: Argv) => {
    return yargs
      .positional("sessionID", {
        describe: "Session ID to resume (omit for most recent)",
        type: "string",
      })
      .option("list", {
        alias: "l",
        describe: "List recent sessions to choose from",
        type: "boolean",
        default: false,
      })
  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      let sessionID: string | undefined = args.sessionID as string | undefined

      // If --list flag, show recent sessions for selection
      if (args.list && !sessionID) {
        const sessions = [...Session.list({ roots: true, limit: 10 })]
        if (sessions.length === 0) {
          UI.println(UI.Style.TEXT_DIM + "No sessions found." + UI.Style.TEXT_NORMAL)
          return
        }

        UI.println(UI.Style.TEXT_INFO_BOLD + "Recent Sessions:" + UI.Style.TEXT_NORMAL)
        UI.println("")
        sessions.forEach((s, i) => {
          const timeStr = Locale.todayTimeOrDateTime(s.time.updated)
          UI.println(`  ${i + 1}. ${UI.Style.TEXT_NORMAL_BOLD}${s.id.slice(0, 12)}${UI.Style.TEXT_NORMAL} - ${s.title} (${timeStr})`)
        })
        UI.println("")
        UI.println(UI.Style.TEXT_DIM + "Usage: opencode session resume <sessionID>" + UI.Style.TEXT_NORMAL)
        return
      }

      // If no sessionID provided, find the most recent session
      if (!sessionID) {
        const sessions = [...Session.list({ roots: true, limit: 1 })]
        if (sessions.length === 0) {
          UI.error("No sessions found to resume.")
          process.exit(1)
        }
        sessionID = sessions[0]!.id
        UI.println(UI.Style.TEXT_DIM + `Resuming most recent session: ${sessionID}` + UI.Style.TEXT_NORMAL)
      }

      const sid = SessionID.make(sessionID)

      // Verify session exists
      let session: Session.Info
      try {
        session = await AppRuntime.runPromise(Session.Service.use((svc) => svc.get(sid)))
      } catch {
        UI.error(`Session not found: ${sessionID}`)
        process.exit(1)
      }

      UI.println(UI.Style.TEXT_SUCCESS_BOLD + `Resuming session: ${session.title}` + UI.Style.TEXT_NORMAL)
      UI.println(`  Session ID: ${session.id}`)
      UI.println(`  Created: ${new Date(session.time.created).toLocaleString()}`)
      UI.println(`  Updated: ${new Date(session.time.updated).toLocaleString()}`)
      UI.println("")

      // In a full implementation, this would:
      // 1. Restore chat history (already persisted in SQLite)
      // 2. Restore file change tracking
      // 3. Restore active tasks
      // 4. Restore loaded skills
      // 5. Restore workflow state
      // For now, the session data is already persisted and will be loaded
      // when the TUI connects to the session.

      UI.println(UI.Style.TEXT_INFO + "Session data is persisted and will be available in the TUI." + UI.Style.TEXT_NORMAL)
      UI.println(UI.Style.TEXT_DIM + "Start opencode to continue this session." + UI.Style.TEXT_NORMAL)

      log.info("Session resume requested", { sessionID: sid })
    })
  },
})

export const SessionDeleteCommand = effectCmd({
  command: "delete <sessionID>",
  describe: "delete a session",
  builder: (yargs) =>
    yargs.positional("sessionID", {
      describe: "session ID to delete",
      type: "string",
      demandOption: true,
    }),
  handler: Effect.fn("Cli.session.delete")(function* (args) {
    const svc = yield* Session.Service
    const sessionID = SessionID.make(args.sessionID)
    yield* svc
      .remove(sessionID)
      .pipe(Effect.catchIf(NotFoundError.isInstance, () => fail(`Session not found: ${args.sessionID}`)))
    UI.println(UI.Style.TEXT_SUCCESS_BOLD + `Session ${args.sessionID} deleted` + UI.Style.TEXT_NORMAL)
  }),
})

export const SessionListCommand = effectCmd({
  command: "list",
  describe: "list sessions",
  builder: (yargs) =>
    yargs
      .option("max-count", {
        alias: "n",
        describe: "limit to N most recent sessions",
        type: "number",
      })
      .option("format", {
        describe: "output format",
        type: "string",
        choices: ["table", "json"],
        default: "table",
      }),
  handler: Effect.fn("Cli.session.list")(function* (args) {
    const sessions = yield* Session.Service.use((svc) => svc.list({ roots: true, limit: args.maxCount }))

    if (sessions.length === 0) return

    const output = args.format === "json" ? formatSessionJSON(sessions) : formatSessionTable(sessions)

    const shouldPaginate = process.stdout.isTTY && !args.maxCount && args.format === "table"

    if (shouldPaginate) {
      yield* Effect.promise(async () => {
        const proc = Process.spawn(pagerCmd(), {
          stdin: "pipe",
          stdout: "inherit",
          stderr: "inherit",
        })

        if (!proc.stdin) {
          console.log(output)
          return
        }

        proc.stdin.write(output)
        proc.stdin.end()
        await proc.exited
      })
    } else {
      console.log(output)
    }
  }),
})

function formatSessionTable(sessions: Session.Info[]): string {
  const lines: string[] = []

  const maxIdWidth = Math.max(20, ...sessions.map((s) => s.id.length))
  const maxTitleWidth = Math.max(25, ...sessions.map((s) => s.title.length))

  const header = `Session ID${" ".repeat(maxIdWidth - 10)}  Title${" ".repeat(maxTitleWidth - 5)}  Updated`
  lines.push(header)
  lines.push("─".repeat(header.length))
  for (const session of sessions) {
    const truncatedTitle = Locale.truncate(session.title, maxTitleWidth)
    const timeStr = Locale.todayTimeOrDateTime(session.time.updated)
    const line = `${session.id.padEnd(maxIdWidth)}  ${truncatedTitle.padEnd(maxTitleWidth)}  ${timeStr}`
    lines.push(line)
  }

  return lines.join(EOL)
}

function formatSessionJSON(sessions: Session.Info[]): string {
  const jsonData = sessions.map((session) => ({
    id: session.id,
    title: session.title,
    updated: session.time.updated,
    created: session.time.created,
    projectId: session.projectID,
    directory: session.directory,
  }))
  return JSON.stringify(jsonData, null, 2)
}
