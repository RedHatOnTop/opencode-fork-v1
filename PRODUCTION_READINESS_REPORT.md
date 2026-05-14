# Production Readiness Report — `opencode-fork-v1/`

> **Report Date:** 2026-05-14  
> **Codebase:** `opencode-fork-v1/` (fork of anomalyco/opencode)  
> **Analyses Conducted:** Architecture & Configuration, Code Quality & Implementation, Security Vulnerability Scan, Test Coverage & Reliability

---

## 1. Executive Summary

### Verdict: 🟡 CONDITIONAL GO — Production-Viable with Required Mitigations

The `opencode-fork-v1/` codebase demonstrates **strong architectural foundations**, **robust error handling**, and **above-average test coverage**. The project leverages modern tooling (Effect-TS, Bun, Turborepo, SST v3) and follows sound engineering practices in most areas. However, several **medium-severity security findings**, **type safety gaps**, and **test coverage holes in critical new modules** must be addressed before a production deployment can be considered fully confident.

**No critical blockers were identified.** All seven security findings fall at Medium severity or below. The codebase has no hardcoded secrets, uses parameterized SQL queries, and implements proper OAuth CSRF protection — indicators of a security-conscious development practice.

**Recommendation:** Proceed to production **after addressing the 3 high-priority items** listed in Section 4. The medium-priority items can be tackled as part of regular development cadence post-launch.

---

## 2. Scoring Dashboard

| Dimension | Score | Grade | Trend |
|---|---|---|---|
| **Architecture & Configuration** | 8.0 / 10 | 🟢 Good | ➡️ Stable |
| **Code Quality & Implementation** | 6.5 / 10 | 🟡 Adequate | ⬆️ Improving |
| **Security** | 7.0 / 10 | 🟡 Adequate | ⬆️ Needs Action |
| **Test Coverage & Reliability** | 7.5 / 10 | 🟢 Good | ⬆️ Improving |
| **Infrastructure & CI/CD** | 7.5 / 10 | 🟢 Good | ➡️ Stable |
| **Overall** | **7.3 / 10** | **🟡 Good** | **➡️ Conditional Go** |

### Scoring Rationale

- **Architecture (8.0):** Effect-TS DI, 40+ well-organized modules, lazy-loaded providers, doom loop detection, and context compaction are impressive. Docked for the 1733-line `provider.ts` monolith and SQLite scalability ceiling.
- **Code Quality (6.5):** 96 `any` types, 20 `@ts-ignore` comments, no `strict: true`, and a 676-line `custom()` function drag the score down despite clean import graphs and good module structure.
- **Security (7.0):** No critical/high findings, strong positive controls (credential storage, path traversal protection, CSP headers). Docked for XSS in OAuth callback and auth token leakage via query params.
- **Testing (7.5):** Exceptional property-based testing (15+ PBT files), strong session/provider tests. Docked for zero E2E tests, missing `src/v2/` coverage, and 14-line DB test.
- **Infrastructure (7.5):** SST v3 + Cloudflare, 12-target cross-platform builds, 30+ CI/CD workflows. Docked for `checkout@v3`/`@v4` inconsistency and hardcoded repository guard.

---

## 3. Critical Blockers

> **No critical blockers identified.** ✅

The codebase can proceed to production without any show-stopping issues. All findings are at Medium severity or below.

---

## 4. High Priority Issues — Fix Before Production

These issues should be resolved before or immediately upon production deployment.

### 🔴 HP-1: XSS in OAuth Error Callback
- **File:** `mcp/oauth-callback.ts:48`
- **Severity:** Medium (CVSS 5.3)
- **Risk:** `HTML_ERROR` template interpolates unsanitized query parameters, enabling reflected XSS attacks against users completing OAuth flows.
- **Fix:** Sanitize all query parameter values before HTML interpolation, or switch to a JSON-based error response instead of HTML rendering.
- **Effort:** Small

### 🔴 HP-2: Auth Token Leakage via Query Parameter
- **File:** `server/middleware.ts:48`
- **Severity:** Medium (CVSS 5.0)
- **Risk:** Authentication tokens passed via query parameters are logged in server access logs, browser history, and referrer headers.
- **Fix:** Migrate token passing to `Authorization` header or request body. Support query parameter only for backward-compatible fallback with a deprecation warning.
- **Effort:** Small–Medium

### 🔴 HP-3: Missing Test Coverage for `src/v2/` Session Architecture
- **Files:** `src/v2/` (entire directory)
- **Severity:** High (reliability risk)
- **Risk:** The new v2 session architecture has **zero test files**. This is the most critical codepath — session management, doom loop detection, and context compaction all live here. Any regression would be caught only in production.
- **Fix:** Add unit tests for v2 session processor, compaction logic, and doom loop detection at minimum. Property-based tests for edge cases.
- **Effort:** Medium–Large

---

## 5. Medium Priority Issues — Address in Regular Development

### 🟠 MP-1: No `strict: true` in TypeScript Configuration
- **File:** `tsconfig.json`
- **Risk:** 96 instances of `any` type, 20 `@ts-ignore`/`@ts-expect-error` comments, `noUncheckedIndexedAccess: false`. Type safety gaps can hide runtime errors.
- **Fix:** Enable `"strict": true` and systematically resolve resulting errors. Start with top 5 hotspot files.

### 🟠 MP-2: Hardcoded Cloudflare Zone ID
- **File:** `infra/stage.ts:7`
- **Risk:** Infrastructure configuration hardcoded in source code reduces portability and violates config-as-code best practices.
- **Fix:** Move to SST Secrets or environment variable.

### 🟠 MP-3: Repository Guard Checks Wrong Origin
- **Files:** CI/CD workflow files
- **Risk:** Guard checks reference `anomalyco/opencode` instead of the fork repository, which will cause CI failures or false passes.
- **Fix:** Update all repository references to the fork's canonical repository.

### 🟠 MP-4: `provider.ts` Monolith (1733 lines)
- **File:** `src/provider/provider.ts`
- **Risk:** The 676-line `custom()` function and overall file size make the provider module difficult to maintain, test, and review.
- **Fix:** Break into per-provider loader files (e.g., `provider-openai.ts`, `provider-anthropic.ts`, etc.).

### 🟠 MP-5: Mutable Module-Level State in MCP OAuth
- **File:** `mcp/` (module-level `pendingOAuthTransports` Map)
- **Risk:** Module-level mutable Map without synchronization can cause race conditions under concurrent OAuth completions.
- **Fix:** Move `pendingOAuthTransports` into Effect-managed state with proper concurrency control.

### 🟠 MP-6: Dual Error Classification Systems
- **Files:** `error-recovery.ts`, `retry.ts`
- **Risk:** Two separate error classification systems create maintenance burden and potential inconsistency in error handling behavior.
- **Fix:** Consolidate into a single error classification and recovery system.

### 🟠 MP-7: `checkout@v3` vs `checkout@v4` Inconsistency
- **Files:** CI/CD workflow files
- **Risk:** Mixed action versions can cause subtle behavioral differences across workflows.
- **Fix:** Standardize all workflows to `actions/checkout@v4`.

### 🟠 MP-8: Zero E2E Test Coverage
- **Files:** `todo.spec.ts` (only placeholder `test.fixme()`)
- **Risk:** No real user flows are tested end-to-end. Integration issues between modules may go undetected.
- **Fix:** Implement at least 3–5 critical path E2E tests (session creation, message exchange, tool execution).

### 🟠 MP-9: Desktop Electron App Has Zero Tests
- **Files:** `desktop-electron/`
- **Risk:** Entire desktop application layer is untested.
- **Fix:** Add integration tests for IPC communication, window management, and app lifecycle.

### 🟠 MP-10: Database Test Coverage Critically Low
- **File:** `db.test.ts` (14 lines only)
- **Risk:** The SQLite database layer — foundational to all data persistence — has minimal test coverage.
- **Fix:** Add comprehensive tests for schema migrations, CRUD operations, WAL mode behavior, and edge cases.

---

## 6. Strengths

The codebase demonstrates several notable strengths that provide confidence in its production viability:

### Architecture
- ✅ **Effect-TS Dependency Injection** — Clean, testable, composable service architecture with proper lifecycle management
- ✅ **Lazy-Loaded Providers** — 40+ AI provider modules loaded on demand, reducing startup time and memory footprint
- ✅ **Session Resilience** — Doom loop detection, retry with exponential backoff and jitter, context compaction for long conversations
- ✅ **Monorepo Tooling** — Well-configured Bun/Turborepo with catalog-based dependency management ensuring version consistency

### Error Handling
- ✅ **7 Error Categories with 6 Recovery Strategies** — Comprehensive error taxonomy with matched recovery approaches
- ✅ **18 Regex Patterns for Provider Error Detection** — Sophisticated pattern matching for translating provider-specific errors
- ✅ **Minimal Empty Catches** — Only 1 true empty catch found; 34 `.catch(() => {})` instances are legitimate cleanup handlers

### Security
- ✅ **No Hardcoded Secrets** — Clean credential management throughout
- ✅ **Proper File Permissions** — Credential storage uses `0o600` (owner read/write only)
- ✅ **Path Traversal Protection** — Input sanitization prevents directory traversal attacks
- ✅ **Parameterized SQL Queries** — No SQL injection vectors found
- ✅ **OAuth CSRF Protection** — Proper state parameter validation
- ✅ **CORS Restriction + CSP Headers** — Appropriate HTTP security controls
- ✅ **Blocked Command Patterns** — Dangerous shell commands are filtered

### Testing
- ✅ **Exceptional Property-Based Testing** — 15+ PBT files using fast-check covering cost, session-resume, compaction, permission, skill, error-recovery, workflow, memory, theme, and task logic
- ✅ **Deep Behavioral Tests** — Session compaction test at 2,182 lines, provider test at 2,715 lines, transform test at 3,295 lines
- ✅ **Proper Test Isolation** — Preload fixtures for XDG dirs, in-memory SQLite, env cleanup, `tmpdir()` with async dispose
- ✅ **Fake Provider Infrastructure** — Test doubles for AI providers enabling deterministic testing

### Code Organization
- ✅ **Clean Dependency Graph** — No circular imports detected
- ✅ **Intentional Barrel Exports** — Consistent module export pattern
- ✅ **Multi-Layer Configuration** — Global/project/workspace/env/managed config layers with SST Secrets for infrastructure

---

## 7. Detailed Findings by Category

### 7.1 Architecture & Configuration

| Finding | Severity | Status | Location |
|---|---|---|---|
| `@solidjs/start` uses CDN-pinned dev build | 🟡 Medium | Needs fix | Package config |
| Fork version `1.14.28-fork.1` formalized | ✅ Done | Complete | Package versioning |
| `provider.ts` 1733 lines | 🟡 Medium | Refactor | `src/provider/provider.ts` |
| Dual error classification systems | 🟡 Medium | Consolidate | `error-recovery.ts`, `retry.ts` |
| Hardcoded Cloudflare zone ID | 🟡 Medium | Externalize | `infra/stage.ts:7` |
| Secret defaults to "unknown" | 🟢 Low | Fix default | Config management |
| `process.env` mutations for AWS/SAP | 🟢 Low | Refactor | Provider initialization |
| SQLite WAL mode — not for concurrent server | 🟢 Low | Document | Architecture decision |
| No rate limiting on HTTP server | 🟢 Low | Add middleware | `server/` |
| No PTY process limit | 🟢 Low | Add cap | PTY management |
| MCP subprocess cleanup 500ms timeout | 🟢 Low | Increase/configure | `mcp/` |

### 7.2 Code Quality & Implementation

| Finding | Severity | Count/Details | Location |
|---|---|---|---|
| No `strict: true` in tsconfig | 🔴 High | — | `tsconfig.json` |
| `any` type usage | 🟡 Medium | 96 instances | Multiple files |
| `@ts-ignore` / `@ts-expect-error` | 🟡 Medium | 20 comments | Multiple files |
| `noUncheckedIndexedAccess: false` | 🟡 Medium | — | `tsconfig.json` |
| TODO/FIXME/HACK comments | 🟢 Low | 14 comments | Multiple files |
| `custom()` function 676 lines | 🟡 Medium | — | `src/provider/provider.ts` |
| Duplicated `crossRegionPrefixes` array | 🟡 Medium | Different values | Provider files |
| MCP creation failure silently swallowed | 🟡 Medium | — | `mcp/` |
| `pendingOAuthTransports` mutable Map | 🟡 Medium | No synchronization | `mcp/` |
| Mutable export for server URL | 🟢 Low | — | `server/` |

### 7.3 Security Vulnerabilities

| ID | Severity | CVSS | Finding | Location |
|---|---|---|---|---|
| SEC-1 | 🟠 Medium | 5.3 | XSS in OAuth Error Callback | `mcp/oauth-callback.ts:48` |
| SEC-2 | 🟠 Medium | 5.0 | Auth Token Leakage via Query Parameter | `server/middleware.ts:48` |
| SEC-3 | 🟠 Medium | 4.7 | Hardcoded Cloudflare Zone ID | `infra/stage.ts:7` |
| SEC-4 | 🟢 Low | 3.5 | Arbitrary Code Execution in Debug CLI | `cli/cmd/debug/agent.ts:110` |
| SEC-5 | 🟢 Low | 3.1 | WSL Path Injection in Desktop App | `desktop-electron/src/main/apps.ts:23` |
| SEC-6 | 🟢 Low | 2.7 | Auth Content Serialized to Workspace Env | `control-plane/workspace.ts:119` |
| SEC-7 | ℹ️ Info | 2.0 | Unauthenticated Server Mode Default | `server/middleware.ts:44` |

**Security Positives:** No hardcoded secrets, proper credential storage (`0o600`), path traversal protection, parameterized SQL queries, OAuth CSRF protection, CORS restriction, CSP headers, blocked command patterns.

### 7.4 Test Coverage & Reliability

| Area | Status | Details |
|---|---|---|
| Test Infrastructure | 🟢 Strong | Bun test runner, proper preload isolation, fake provider infrastructure |
| Module Coverage | 🟡 Adequate | 100+ test files, 35+ modules covered |
| Property-Based Testing | 🟢 Exceptional | 15+ PBT files using fast-check |
| Test Quality | 🟢 Strong | Deep behavioral tests, tests behavior not implementation |
| E2E Tests | 🔴 Weak | Only placeholder `test.fixme()` — no real user flows |
| Storage Tests | 🔴 Critical | `db.test.ts` is 14 lines only |
| `src/v2/` Coverage | 🔴 Missing | Zero tests for new session architecture |
| `src/mention/` Coverage | 🟡 Missing | No tests |
| `src/notification/` Coverage | 🟡 Missing | No tests |
| `src/feature/` Coverage | 🟡 Missing | No tests |
| `src/command/` Coverage | 🟡 Missing | No tests |
| `desktop-electron/` Coverage | 🔴 Missing | Zero tests |
| CI Matrix | 🟡 Adequate | Linux + Windows; missing macOS |
| Code Coverage Reporting | 🟡 Missing | No coverage metrics in CI |

---

## 8. Remediation Roadmap

### Phase 1 — Pre-Production (Must Complete)

| # | Item | Priority | Effort |
|---|---|---|---|
| 1 | Fix XSS in OAuth error callback — sanitize query params in `mcp/oauth-callback.ts:48` | 🔴 Critical | Small |
| 2 | Fix auth token leakage — move from query param to header in `server/middleware.ts:48` | 🔴 Critical | Small |
| 3 | Add minimum test coverage for `src/v2/` session architecture | 🔴 Critical | Medium |
| 4 | Update repository guard checks from `anomalyco/opencode` to fork | 🔴 High | Small |
| 5 | Externalize hardcoded Cloudflare zone ID to env var/SST Secret | 🟠 High | Small |

### Phase 2 — Post-Launch Hardening (First Sprint)

| # | Item | Priority | Effort |
|---|---|---|---|
| 6 | Enable `"strict": true` in `tsconfig.json` | 🟠 High | Medium |
| 7 | Replace `any` with `unknown` in top 5 hotspot files | 🟠 High | Medium |
| 8 | Move `pendingOAuthTransports` into Effect-managed state | 🟠 High | Small |
| 9 | Standardize CI workflows to `actions/checkout@v4` | 🟠 Medium | Small |
| 10 | Formalize fork version numbering | 🟠 Medium | Small |

### Phase 3 — Quality Improvement (Ongoing)

| # | Item | Priority | Effort |
|---|---|---|---|
| 11 | Break `provider.ts` into per-provider loader files | 🟡 Medium | Large |
| 12 | Consolidate dual error classification systems | 🟡 Medium | Medium |
| 13 | Add comprehensive DB tests (schema, CRUD, WAL) | 🟡 Medium | Medium |
| 14 | Implement 3–5 critical path E2E tests | 🟡 Medium | Medium |
| 15 | Add desktop-electron integration tests | 🟡 Medium | Medium |
| 16 | Add code coverage reporting to CI | 🟡 Medium | Small |
| 17 | Add macOS to CI test matrix | 🟢 Low | Small |
| 18 | Resolve duplicated `crossRegionPrefixes` arrays | 🟢 Low | Small |
| 19 | Add rate limiting middleware to HTTP server | 🟢 Low | Small |
| 20 | Increase MCP subprocess cleanup timeout | 🟢 Low | Small |

---

## 9. Conclusion

The `opencode-fork-v1/` codebase is **production-viable with conditions**. It exhibits strong architectural patterns, sophisticated error handling, and exceptional property-based testing — all indicators of a mature, well-engineered project.

The three pre-production requirements (OAuth XSS fix, auth token leakage fix, and v2 session tests) are **small in scope but high in impact**. They address the most likely vectors for production incidents and should be completed before any user-facing deployment.

The codebase's strengths significantly outweigh its weaknesses. The Effect-TS architecture, comprehensive error recovery, and deep test suites for core modules provide a solid foundation. The identified issues are typical of a fast-moving project and are all addressable within normal development cycles.

**Final Recommendation: 🟡 CONDITIONAL GO** — Proceed to production after completing the 5 items in Phase 1 of the Remediation Roadmap.

---

*Report generated from four independent analyses: Architecture & Configuration, Code Quality & Implementation, Security Vulnerability Scan, and Test Coverage & Reliability Assessment.*
