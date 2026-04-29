/**
 * Theme Engine - UX Theme System
 *
 * Manages TUI themes with support for:
 * - Built-in themes (default, dark, light, high-contrast)
 * - Custom theme definitions
 * - Theme persistence
 * - Dynamic theme switching
 */

import { Schema, Context, Effect, Layer, Option, Config as EffectConfig } from "effect"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "theme" })

/**
 * Color definition
 */
export const Color = Schema.Struct({
  foreground: Schema.optional(Schema.String),
  background: Schema.optional(Schema.String),
  bold: Schema.optional(Schema.Boolean),
  dim: Schema.optional(Schema.Boolean),
  italic: Schema.optional(Schema.Boolean),
  underline: Schema.optional(Schema.Boolean),
})
export type Color = Schema.Schema.Type<typeof Color>

/**
 * Theme definition
 */
export const Theme = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  isDark: Schema.Boolean,
  colors: Schema.Struct({
    // UI colors
    primary: Schema.String,
    secondary: Schema.String,
    success: Schema.String,
    warning: Schema.String,
    error: Schema.String,
    info: Schema.String,
    muted: Schema.String,
    background: Schema.String,
    foreground: Schema.String,
    border: Schema.String,
    highlight: Schema.String,
    // Message colors
    userMessage: Schema.String,
    assistantMessage: Schema.String,
    systemMessage: Schema.String,
    toolMessage: Schema.String,
    errorMessage: Schema.String,
  }),
  styles: Schema.Struct({
    text: Color,
    textBold: Color,
    textDim: Color,
    textWarning: Color,
    textWarningBold: Color,
    textError: Color,
    textErrorBold: Color,
    textSuccess: Color,
    textSuccessBold: Color,
    textInfo: Color,
    textInfoBold: Color,
  }),
})
export type Theme = Schema.Schema.Type<typeof Theme>

/**
 * Built-in themes
 */
export const BUILTIN_THEMES: Record<string, Theme> = {
  default: {
    name: "default",
    description: "Default theme with balanced colors",
    isDark: true,
    colors: {
      primary: "#007ACC",
      secondary: "#6C757D",
      success: "#28A745",
      warning: "#FFC107",
      error: "#DC3545",
      info: "#17A2B8",
      muted: "#6C757D",
      background: "#1E1E1E",
      foreground: "#D4D4D4",
      border: "#3E3E3E",
      highlight: "#264F78",
      userMessage: "#007ACC",
      assistantMessage: "#D4D4D4",
      systemMessage: "#6C757D",
      toolMessage: "#28A745",
      errorMessage: "#DC3545",
    },
    styles: {
      text: { foreground: "#D4D4D4" },
      textBold: { foreground: "#FFFFFF", bold: true },
      textDim: { foreground: "#6C757D", dim: true },
      textWarning: { foreground: "#FFC107" },
      textWarningBold: { foreground: "#FFC107", bold: true },
      textError: { foreground: "#DC3545" },
      textErrorBold: { foreground: "#DC3545", bold: true },
      textSuccess: { foreground: "#28A745" },
      textSuccessBold: { foreground: "#28A745", bold: true },
      textInfo: { foreground: "#17A2B8" },
      textInfoBold: { foreground: "#17A2B8", bold: true },
    },
  },

  light: {
    name: "light",
    description: "Light theme for bright environments",
    isDark: false,
    colors: {
      primary: "#0056B3",
      secondary: "#6C757D",
      success: "#198754",
      warning: "#FFC107",
      error: "#DC3545",
      info: "#0DCAF0",
      muted: "#6C757D",
      background: "#FFFFFF",
      foreground: "#212529",
      border: "#DEE2E6",
      highlight: "#E9ECEF",
      userMessage: "#0056B3",
      assistantMessage: "#212529",
      systemMessage: "#6C757D",
      toolMessage: "#198754",
      errorMessage: "#DC3545",
    },
    styles: {
      text: { foreground: "#212529" },
      textBold: { foreground: "#000000", bold: true },
      textDim: { foreground: "#6C757D", dim: true },
      textWarning: { foreground: "#664D03" },
      textWarningBold: { foreground: "#664D03", bold: true },
      textError: { foreground: "#842029" },
      textErrorBold: { foreground: "#842029", bold: true },
      textSuccess: { foreground: "#0F5132" },
      textSuccessBold: { foreground: "#0F5132", bold: true },
      textInfo: { foreground: "#055160" },
      textInfoBold: { foreground: "#055160", bold: true },
    },
  },

  "high-contrast": {
    name: "high-contrast",
    description: "High contrast theme for accessibility",
    isDark: true,
    colors: {
      primary: "#00D4FF",
      secondary: "#FFFFFF",
      success: "#00FF00",
      warning: "#FFFF00",
      error: "#FF0000",
      info: "#00FFFF",
      muted: "#888888",
      background: "#000000",
      foreground: "#FFFFFF",
      border: "#FFFFFF",
      highlight: "#FFFF00",
      userMessage: "#00D4FF",
      assistantMessage: "#FFFFFF",
      systemMessage: "#888888",
      toolMessage: "#00FF00",
      errorMessage: "#FF0000",
    },
    styles: {
      text: { foreground: "#FFFFFF", bold: true },
      textBold: { foreground: "#FFFFFF", bold: true, underline: true },
      textDim: { foreground: "#888888" },
      textWarning: { foreground: "#FFFF00", bold: true },
      textWarningBold: { foreground: "#FFFF00", bold: true, underline: true },
      textError: { foreground: "#FF0000", bold: true },
      textErrorBold: { foreground: "#FF0000", bold: true, underline: true },
      textSuccess: { foreground: "#00FF00", bold: true },
      textSuccessBold: { foreground: "#00FF00", bold: true, underline: true },
      textInfo: { foreground: "#00FFFF", bold: true },
      textInfoBold: { foreground: "#00FFFF", bold: true, underline: true },
    },
  },
}

/**
 * Theme Engine Service Interface
 */
export interface Interface {
  readonly getCurrentTheme: Effect.Effect<Theme>
  readonly setTheme: (themeName: string) => Effect.Effect<void>
  readonly getTheme: (themeName: string) => Effect.Effect<Option.Option<Theme>>
  readonly listThemes: Effect.Effect<ReadonlyArray<{ name: string; description: string; isDark: boolean }>>
  readonly getStyle: (styleName: keyof Theme["styles"]) => Effect.Effect<Color>
  readonly getColor: (colorName: keyof Theme["colors"]) => Effect.Effect<string>
  readonly isDark: Effect.Effect<boolean>
  readonly registerCustomTheme: (theme: Theme) => Effect.Effect<void>
}

/**
 * Theme Engine Service
 */
export class Service extends Context.Service<Service, Interface>()("@opencode/Theme") {}

// State
interface State {
  currentTheme: Theme
  customThemes: Map<string, Theme>
}

/**
 * Service layer implementation
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    // Default to "default" theme (config loading can be added later)
    const themeName = "default"

    const initialTheme = BUILTIN_THEMES[themeName] || BUILTIN_THEMES.default

    const state: State = {
      currentTheme: initialTheme,
      customThemes: new Map(),
    }

    const getCurrentTheme = Effect.fn("Theme.getCurrentTheme")(function* () {
      return state.currentTheme
    })

    const setTheme = Effect.fn("Theme.setTheme")(function* (themeName: string) {
      // Check built-in themes first
      let theme = BUILTIN_THEMES[themeName]

      // Then check custom themes
      if (!theme) {
        theme = state.customThemes.get(themeName)
      }

      if (!theme) {
        return yield* Effect.fail(new Error(`Theme not found: ${themeName}`))
      }

      state.currentTheme = theme
      log.info("Theme changed", { from: state.currentTheme.name, to: themeName })
    })

    const getTheme = Effect.fn("Theme.getTheme")(function* (themeName: string) {
      const theme = BUILTIN_THEMES[themeName] || state.customThemes.get(themeName)
      if (theme) {
        return Option.some(theme)
      }
      return Option.none()
    })

    const listThemes = Effect.fn("Theme.listThemes")(function* () {
      const builtIn = Object.values(BUILTIN_THEMES).map((t) => ({
        name: t.name,
        description: t.description,
        isDark: t.isDark,
      }))

      const custom = Array.from(state.customThemes.values()).map((t) => ({
        name: t.name,
        description: t.description,
        isDark: t.isDark,
      }))

      return [...builtIn, ...custom]
    })

    const getStyle = Effect.fn("Theme.getStyle")(
      function* (styleName: keyof Theme["styles"]) {
        return state.currentTheme.styles[styleName]
      }
    )

    const getColor = Effect.fn("Theme.getColor")(
      function* (colorName: keyof Theme["colors"]) {
        return state.currentTheme.colors[colorName]
      }
    )

    const isDark = Effect.fn("Theme.isDark")(function* () {
      return state.currentTheme.isDark
    })

    const registerCustomTheme = Effect.fn("Theme.registerCustomTheme")(
      function* (theme: Theme) {
        state.customThemes.set(theme.name, theme)
        log.info("Custom theme registered", { name: theme.name })
      }
    )

    return Service.of({
      getCurrentTheme,
      setTheme,
      getTheme,
      listThemes,
      getStyle,
      getColor,
      isDark,
      registerCustomTheme,
    })
  })
)

export const defaultLayer = layer

/**
 * Helper: Apply ANSI color codes (simplified)
 * In production, this would use a proper ANSI library
 */
export function applyColor(text: string, color: Color): string {
  let result = text

  if (color.bold) result = `\x1b[1m${result}\x1b[22m`
  if (color.dim) result = `\x1b[2m${result}\x1b[22m`
  if (color.italic) result = `\x1b[3m${result}\x1b[23m`
  if (color.underline) result = `\x1b[4m${result}\x1b[24m`

  if (color.foreground) {
    // Simplified: just use bright colors
    const colorCode = getAnsiColorCode(color.foreground)
    result = `\x1b[${colorCode}m${result}\x1b[39m`
  }

  return result
}

/**
 * Simple color to ANSI code mapping
 */
function getAnsiColorCode(color: string): number {
  const colorMap: Record<string, number> = {
    "#DC3545": 31, // red
    "#28A745": 32, // green
    "#FFC107": 33, // yellow
    "#007ACC": 34, // blue
    "#FF00FF": 35, // magenta
    "#17A2B8": 36, // cyan
    "#D4D4D4": 37, // white
    "#FFFFFF": 97, // bright white
    "#6C757D": 90, // bright black (gray)
    "#FF0000": 91, // bright red
    "#00FF00": 92, // bright green
    "#FFFF00": 93, // bright yellow
    "#00D4FF": 94, // bright blue
    "#00FFFF": 96, // bright cyan
    "#212529": 30, // black
    "#000000": 30, // black
  }

  return colorMap[color] || 37
}
