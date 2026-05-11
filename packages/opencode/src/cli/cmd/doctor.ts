/**
 * Doctor Command - System Diagnostics
 *
 * Displays system health report including recent errors,
 * retry events, and recommendations.
 */

import type { Argv } from "yargs"
import { Effect } from "effect"
import { bootstrap } from "../bootstrap"
import { Service as ErrorRecoveryService, getDoctorReport } from "@/provider/error-recovery"
import { defaultLayer as errorRecoveryLayer } from "@/provider/error-recovery"

export const command = "doctor"
export const describe = "Display system health report and recent errors"

export function builder(yargs: Argv) {
  return yargs
    .option("full", {
      type: "boolean",
      describe: "Show full diagnostic report",
      default: false,
    })
    .example([
      ["/doctor", "Show brief health report"],
      ["/doctor --full", "Show full diagnostic report"],
    ])
}

type DoctorArgs = {
  full: boolean
}

export async function handler(args: DoctorArgs) {
  await bootstrap(process.cwd(), async () => {
    const program = Effect.gen(function* () {
      const errorService = yield* ErrorRecoveryService
      
      // Get recent errors
      const recentErrors = yield* errorService.getRecentErrors(args.full ? 50 : 10)
      
      // Generate report
      const report = getDoctorReport(recentErrors)
      
      // Display report
      console.log(report)
      
      // Additional diagnostics in full mode
      if (args.full) {
        console.log("")
        console.log("### Error Categories:")
        
        const categories = [
          "connection",
          "authentication", 
          "rate_limit",
          "server_overload",
          "model_error",
          "prompt_overflow",
          "media_size",
          "unknown",
        ] as const
        
        for (const category of categories) {
          const errors = yield* errorService.getErrorsByCategory(category)
          if (errors.length > 0) {
            console.log(`- ${category}: ${errors.length} errors`)
          }
        }
        
        console.log("")
        console.log("### System Status:")
        console.log("- Error Recovery: Active")
        console.log("- Retry Strategy: Exponential backoff with jitter")
        console.log("- Context Compression: Available")
        console.log("- Fallback Models: Configurable")
      }
    })
    
    const result = await Effect.runPromise(
      Effect.provide(program, errorRecoveryLayer)
    )
    
    return result
  })
}
