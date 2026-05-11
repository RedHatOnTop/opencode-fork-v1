export function online() {
  const nav = globalThis.navigator
  if (!nav || typeof nav.onLine !== "boolean") return true
  return nav.onLine
}

export function proxied() {
  return !!(process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.https_proxy)
}

const LOOPBACK = ["127.0.0.1", "localhost", "::1"]

export function ensureLoopbackNoProxy() {
  const upsert = (key: string) => {
    const items = (process.env[key] ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
    for (const host of LOOPBACK) {
      if (items.some((v) => v.toLowerCase() === host)) continue
      items.push(host)
    }
    process.env[key] = items.join(",")
  }
  upsert("NO_PROXY")
  upsert("no_proxy")
}
