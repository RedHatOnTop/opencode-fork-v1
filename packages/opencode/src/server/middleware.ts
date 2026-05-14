import { Provider } from "@/provider/provider"
import { NamedError } from "@opencode-ai/core/util/error"
import { NotFoundError } from "@/storage/storage"
import { Session } from "@/session/session"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import type { ErrorHandler, MiddlewareHandler } from "hono"
import { HTTPException } from "hono/http-exception"
import * as Log from "@opencode-ai/core/util/log"
import { Flag } from "@opencode-ai/core/flag/flag"
import { basicAuth } from "hono/basic-auth"
import { cors } from "hono/cors"
import { compress } from "hono/compress"

const log = Log.create({ service: "server" })

/**
 * Redact sensitive query parameters from a URL string to prevent
 * token leakage in logs, browser history, and referrer headers.
 */
function sanitizeUrl(url: string): string {
  return url.replace(/([?&])auth_token=[^&]*/g, "$1auth_token=[REDACTED]")
}

export const ErrorMiddleware: ErrorHandler = (err, c) => {
  log.error("failed", {
    error: err,
  })
  if (err instanceof NamedError) {
    let status: ContentfulStatusCode
    if (err instanceof NotFoundError) status = 404
    else if (err instanceof Provider.ModelNotFoundError) status = 400
    else if (err.name === "ProviderAuthValidationFailed") status = 400
    else if (err.name.startsWith("Worktree")) status = 400
    else status = 500
    return c.json(err.toObject(), { status })
  }
  if (err instanceof Session.BusyError) {
    return c.json(new NamedError.Unknown({ message: err.message }).toObject(), { status: 400 })
  }
  if (err instanceof HTTPException) return err.getResponse()
  const message = err instanceof Error ? err.message : String(err)
  log.error("unhandled error", { error: err instanceof Error ? err.stack : String(err) })
  return c.json(new NamedError.Unknown({ message }).toObject(), {
    status: 500,
  })
}

export const AuthMiddleware: MiddlewareHandler = (c, next) => {
  // Allow CORS preflight requests to succeed without auth.
  // Browser clients sending Authorization headers will preflight with OPTIONS.
  if (c.req.method === "OPTIONS") return next()
  const password = Flag.OPENCODE_SERVER_PASSWORD
  if (!password) return next()
  const username = Flag.OPENCODE_SERVER_USERNAME ?? "opencode"

  // SECURITY: auth_token query parameter support is deprecated.
  // Use Authorization header instead. The token is read once and set as a
  // header so downstream code never needs the query parameter.
  // Note: Hono's c.req.raw is a standard Request with an immutable URL,
  // so the query parameter cannot be removed in-place. The LoggerMiddleware
  // redacts auth_token from any logged output as a fallback defense.
  const authToken = c.req.query("auth_token")
  if (authToken) {
    c.req.raw.headers.set("authorization", `Basic ${authToken}`)
  }

  return basicAuth({ username, password })(c, next)
}

export const LoggerMiddleware: MiddlewareHandler = async (c, next) => {
  const skip = c.req.path === "/log"
  // Sanitize the full URL to redact auth_token in case c.req.url or
  // similar is ever used here. c.req.path does not include query params
  // today, but sanitizeUrl is applied defensively for future safety.
  const sanitizedPath = sanitizeUrl(c.req.path)
  const sanitizedUrl = sanitizeUrl(c.req.url)
  if (!skip) {
    log.info("request", {
      method: c.req.method,
      path: sanitizedPath,
      url: sanitizedUrl,
    })
  }
  const timer = log.time("request", {
    method: c.req.method,
    path: sanitizedPath,
  })
  await next()
  if (!skip) timer.stop()
}

export function CorsMiddleware(opts?: { cors?: string[] }): MiddlewareHandler {
  return cors({
    maxAge: 86_400,
    origin(input) {
      if (!input) return

      if (input.startsWith("http://localhost:")) return input
      if (input.startsWith("http://127.0.0.1:")) return input
      if (input === "tauri://localhost" || input === "http://tauri.localhost" || input === "https://tauri.localhost")
        return input

      if (/^https:\/\/([a-z0-9-]+\.)*opencode\.ai$/.test(input)) return input
      if (opts?.cors?.includes(input)) return input
    },
  })
}

const zipped = compress()
export const CompressionMiddleware: MiddlewareHandler = (c, next) => {
  const path = c.req.path
  const method = c.req.method
  if (path === "/event" || path === "/global/event") return next()
  if (method === "POST" && /\/session\/[^/]+\/(message|prompt_async)$/.test(path)) return next()
  return zipped(c, next)
}
