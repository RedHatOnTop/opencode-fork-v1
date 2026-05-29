
import { Wildcard } from "@/util/wildcard"
import type { ApprovalMode, ToolCategory } from "./approval-mode"
import { MODE_POLICIES } from "./approval-mode"
import { analyzeCommand, getCategoriesForMode } from "./blocked-commands"

export type RuleAction = "allow" | "deny" | "ask" | "queue"

type Rule = {
  permission: string
  pattern: string
  action: RuleAction
}

export function evaluate(permission: string, pattern: string, ...rulesets: Rule[][]): Rule {
  const rules = rulesets.flat()
  const match = rules.findLast(
    (rule) => Wildcard.match(permission, rule.permission) && Wildcard.match(pattern, rule.pattern),
  )
  return match ?? { action: "ask", permission, pattern: "*" }
}

export function evaluateWithMode(
  permission: string,
  pattern: string,
  mode: ApprovalMode,
  ...rulesets: Rule[][]
): Rule {
  // First evaluate with the user's explicitly approved/denied ruleset
  const rule = evaluate(permission, pattern, ...rulesets)

  // Map the permission (e.g., bash, file) to the mode's category
  let category: ToolCategory | undefined
  if (permission === "bash" || permission === "shell" || permission === "execute") category = "bash"
  else if (permission === "edit" || permission === "write") category = "edit"
  else if (permission === "read") category = "read"
  else if (permission === "create") category = "create"
  else if (permission === "delete") category = "delete"
  else if (permission === "glob") category = "glob"
  else if (permission === "grep") category = "grep"

  if (category) {
    const policyAction = MODE_POLICIES[mode][category]
    
    // Check blocked command registry for shell commands
    if (category === "bash" && mode !== "strict") {
      const categoriesToCheck = getCategoriesForMode(mode)
      if (categoriesToCheck.length > 0) {
        const blocks = analyzeCommand(pattern, categoriesToCheck)
        if (blocks.length > 0) {
          // If destructive, always ask (even in YOLO)
          if (blocks.some((b) => b.category === "destructive")) {
             return { action: "ask", permission, pattern }
          }
          // If other blocks (e.g. network in autopilot), queue it
          return { action: "queue", permission, pattern }
        }
      }
    }
    
    // If the base ruleset evaluates to 'ask' but the mode says 'allow', we can override it to 'allow'
    if (rule.action === "ask" && policyAction === "allow") {
       return { action: "allow", permission, pattern }
    }
  }

  return rule
}

