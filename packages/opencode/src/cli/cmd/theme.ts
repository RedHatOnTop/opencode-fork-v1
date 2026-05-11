/**
 * /theme Command - Theme Management
 *
 * Implements the /theme command for managing TUI themes:
 * - list: List available themes
 * - set: Set active theme
 * - get: Get current theme
 * - preview: Preview theme colors
 */

import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { UI } from "../ui"
import { bootstrap } from "../bootstrap"
import { Effect, Option } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import {
  Service as ThemeService,
  defaultLayer as themeLayer,
} from "@/theme/theme"

const log = Log.create({ service: "theme-cmd" })

/**
 * Print color sample
 */
function printColorSample(name: string, color: string): void {
  // Simplified: just show the color code
  UI.println(`  ${name.padEnd(20)} ${color}`)
}

export const ThemeCommand = cmd({
  command: "theme [action]",
  describe: "Manage TUI themes",
  builder: (yargs: Argv) => {
    return yargs
      .positional("action", {
        describe: "Action to perform",
        type: "string",
        choices: ["list", "set", "get", "preview"],
        default: "get",
      })
      .option("name", {
        alias: "n",
        describe: "Theme name (for set action)",
        type: "string",
      })
  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const action = args.action as string

      const program = Effect.gen(function* () {
        const theme = yield* ThemeService

        switch (action) {
          case "list": {
            const themes = yield* theme.listThemes()
            const current = yield* theme.getCurrentTheme()

            UI.println(UI.Style.TEXT_INFO_BOLD + "Available Themes:" + UI.Style.TEXT_NORMAL)
            UI.println("")

            themes.forEach((t: { name: string; description: string; isDark: boolean }, index: number) => {
              const isCurrent = t.name === current.name
              const marker = isCurrent ? UI.Style.TEXT_SUCCESS + "● " + UI.Style.TEXT_NORMAL : "  "
              const darkIndicator = t.isDark ? "🌙" : "☀️"
              const name = isCurrent
                ? UI.Style.TEXT_SUCCESS_BOLD + t.name + UI.Style.TEXT_NORMAL
                : UI.Style.TEXT_NORMAL_BOLD + t.name + UI.Style.TEXT_NORMAL

              UI.println(`${marker}${darkIndicator} ${name}`)
              UI.println(`    ${t.description}`)
              UI.println("")
            })

            UI.println(UI.Style.TEXT_DIM + `Total: ${themes.length} themes` + UI.Style.TEXT_NORMAL)
            break
          }

          case "set": {
            const name = args.name as string | undefined
            if (!name) {
              UI.error("Error: --name is required for set action")
              UI.error("Usage: opencode theme set --name <theme-name>")
              UI.println("")
              UI.println(UI.Style.TEXT_DIM + "Use 'opencode theme list' to see available themes." + UI.Style.TEXT_NORMAL)
              process.exit(1)
            }

            // Check if theme exists
            const themeOpt = yield* theme.getTheme(name)
            if (Option.isNone(themeOpt)) {
              UI.error(`Error: Theme "${name}" not found`)
              UI.println("")
              UI.println(UI.Style.TEXT_DIM + "Use 'opencode theme list' to see available themes." + UI.Style.TEXT_NORMAL)
              process.exit(1)
            }

            yield* theme.setTheme(name)

            const newTheme = yield* theme.getCurrentTheme()
            UI.println(UI.Style.TEXT_SUCCESS + `✓ Theme set to: ${newTheme.name}` + UI.Style.TEXT_NORMAL)
            UI.println("")
            UI.println(`Description: ${newTheme.description}`)
            UI.println(`Mode: ${newTheme.isDark ? "Dark" : "Light"}`)

            log.info("Theme changed", { theme: name })
            break
          }

          case "get": {
            const current = yield* theme.getCurrentTheme()
            const isDark = yield* theme.isDark()

            UI.println(UI.Style.TEXT_INFO_BOLD + "Current Theme:" + UI.Style.TEXT_NORMAL)
            UI.println("")
            UI.println(`  Name:        ${UI.Style.TEXT_NORMAL_BOLD}${current.name}${UI.Style.TEXT_NORMAL}`)
            UI.println(`  Description: ${current.description}`)
            UI.println(`  Mode:        ${isDark ? UI.Style.TEXT_DIM + "Dark" : "Light"}${UI.Style.TEXT_NORMAL}`)
            UI.println("")
            UI.println(UI.Style.TEXT_DIM + "Use 'opencode theme list' to see all themes." + UI.Style.TEXT_NORMAL)
            break
          }

          case "preview": {
            const current = yield* theme.getCurrentTheme()

            UI.println(UI.Style.TEXT_INFO_BOLD + `Theme Preview: ${current.name}` + UI.Style.TEXT_NORMAL)
            UI.println("")

            UI.println(UI.Style.TEXT_NORMAL_BOLD + "UI Colors:" + UI.Style.TEXT_NORMAL)
            printColorSample("Primary", current.colors.primary)
            printColorSample("Secondary", current.colors.secondary)
            printColorSample("Success", current.colors.success)
            printColorSample("Warning", current.colors.warning)
            printColorSample("Error", current.colors.error)
            printColorSample("Info", current.colors.info)
            printColorSample("Muted", current.colors.muted)
            printColorSample("Background", current.colors.background)
            printColorSample("Foreground", current.colors.foreground)
            UI.println("")

            UI.println(UI.Style.TEXT_NORMAL_BOLD + "Style Samples:" + UI.Style.TEXT_NORMAL)
            UI.println(`  ${UI.Style.TEXT_NORMAL}TEXT_NORMAL${UI.Style.TEXT_NORMAL}`)
            UI.println(`  ${UI.Style.TEXT_NORMAL_BOLD}TEXT_BOLD${UI.Style.TEXT_NORMAL}`)
            UI.println(`  ${UI.Style.TEXT_DIM}TEXT_DIM${UI.Style.TEXT_NORMAL}`)
            UI.println(`  ${UI.Style.TEXT_WARNING}TEXT_WARNING${UI.Style.TEXT_NORMAL}`)
            UI.println(`  ${UI.Style.TEXT_WARNING_BOLD}TEXT_WARNING_BOLD${UI.Style.TEXT_NORMAL}`)
            UI.println(`  ${UI.Style.TEXT_DANGER}TEXT_ERROR${UI.Style.TEXT_NORMAL}`)
            UI.println(`  ${UI.Style.TEXT_DANGER_BOLD}TEXT_ERROR_BOLD${UI.Style.TEXT_NORMAL}`)
            UI.println(`  ${UI.Style.TEXT_SUCCESS}TEXT_SUCCESS${UI.Style.TEXT_NORMAL}`)
            UI.println(`  ${UI.Style.TEXT_SUCCESS_BOLD}TEXT_SUCCESS_BOLD${UI.Style.TEXT_NORMAL}`)
            UI.println(`  ${UI.Style.TEXT_INFO}TEXT_INFO${UI.Style.TEXT_NORMAL}`)
            UI.println(`  ${UI.Style.TEXT_INFO_BOLD}TEXT_INFO_BOLD${UI.Style.TEXT_NORMAL}`)
            break
          }

          default: {
            UI.error(`Unknown action: ${action}`)
            UI.error("Valid actions: list, set, get, preview")
            process.exit(1)
          }
        }
      })

      await Effect.runPromise(Effect.provide(program, themeLayer) as any)
    })
  },
})
