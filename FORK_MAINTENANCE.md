# Fork 정비 가이드 (maintainer)

> 사용자용 설치/사용 문서는 [`README.fork.md`](./README.fork.md). 이 문서는 **정비자용** — 업스트림을 못 따라가는 빠른 프로젝트를 "한번씩 동기화 + 선택적 수용"으로 유지하기 위한 절차와, 커스터마이징이 동기화 때 조용히 사라지지 않게 지키는 방법.

**Upstream:** `anomalyco/opencode` (remote: `upstream`) · **기본 브랜치:** `dev`

---

## 왜 이 문서가 필요한가

이 포크는 upstream 대비 **70+ 커밋**을 커스터마이징함(`git log upstream/dev..dev --oneline --no-merges`). upstream은 빠르게 움직이고, `git merge upstream/dev`는 **커스터마이징을 조용히 덮을 수 있음**. 실제 소실 사례:

- `util/archive.ts` PowerShell 인젝션 수정 — 커밋 안 돼 upstream 리팩터에 묻힘 (2026-07 재적용).
- `lsp/client.ts` `evictFileCache` (파일 캐시 캡) — 커밋됐다가 이후 머지에 제거됨.
- `tui/.../session/index.tsx` `alwaysSeparate` 선언 — 사용부는 남고 선언만 유실 → 클린 체크아웃 빌드 실패.

교훈: **① 모든 커스터마이징은 커밋 + 마킹, ② 동기화 후 반드시 무결성 체크.**

---

## 1. 커스터마이징 인벤토리 (must-survive)

동기화 후 이것들이 살아있어야 함. 상세 diff는 `git diff upstream/dev...dev`가 단일 진실원(source of truth); 아래는 의도별 요약.

| 영역 | 커스터마이징 | 주요 파일/커밋 |
|------|-------------|----------------|
| **Identity** | 바이너리 `opencode-mod` 리네임, `-fork.{n}` 버전 스킴 | `460f15895`, `2d023d421` |
| **CI/배포** | 업스트림 자동배포 비활성, OTA 배포 워크플로 + 원클릭 설치 스크립트(`install.ps1/.sh`) | `d3b9d6a47`, `c47c31fe4` |
| **Loop 안전장치** | stateless loop detection + step-limit safety net (`session/loop-detect.ts`) | `f28d9983d`, `4598bac5f`, `1ac986fa0` |
| **Claude Code 연동** | Claude Code config의 skills/MCP 자동 주입 (`mcp/claude-code-sources.ts`) | `0fbeef186` |
| **Provider** | OpenAI-compatible 모델 discovery + refresh API | `d92bd53fa` |
| **Agent 품질** | 위임 유도 프롬프트, agent 품질 규칙, **Go upsell 제거** | `234e42fd2`, `604e24158` |
| **Agent 스위트** | conductor + 9 서브에이전트 + 파이프라인 커맨드 (`.opencode/`) | `71b64ae4e` |
| **TUI** | thinking 블록 자동확장, 스트리밍 auto-scroll, tab 언바인드, `alwaysSeparate` 분리 로직, CLI 다이얼로그/모델/프로바이더 컴포넌트 | `e119b91e7`, `5c928d05a`, `020d41b78`, `70cd5df7a`, `99cb1c7ea` |
| **MCP** | MCP 서버 env var 편집 UI | `ee7ba7b3d` |
| **실행 환경** | sandbox 컨테이너 + bash 실행 도구, loopback no-proxy 유틸 | `7671fe2d5`, `d7f657e70` |
| **Spec 모드** | spec-mode phase/guard/indicator | `8b1ca57e7` |
| **호환성** | Effect v4 마이그레이션 계층 (Layer 순서, Bus 통합, InstanceState.context) | `841ac9aff`, `100d9a4ca` |
| **보안 선적용** | upstream 미반영 보안 수정 (예: archive 인젝션) | `96b985865` |
| **무결성 가드** | `.opencode` config guard 테스트 | `f7bc5da16` |

> 갱신 규칙: 새 커스터마이징 커밋 시 이 표에 한 줄 추가. 표가 곧 "동기화 후 확인 체크리스트".

---

## 2. `// fork:` 주석 규칙 (필수)

**upstream 파일을 수정/삭제하는 모든 지점**에 마킹 — 그래야 grep으로 전수 확인 가능하고, 머지 충돌 때 의도를 알 수 있음.

```ts
// fork: Go upsell intentionally removed (commit 604e24158); keep it dropped on upstream sync.
```

형식: `// fork: <무엇을><왜> (<근거 커밋/이슈>). <동기화 시 지침>.`

전수 확인:

```sh
git grep -n "fork:" -- '*.ts' '*.tsx' '*.json' '*.md'
```

> 현재 인라인 마킹이 3곳뿐 — 인벤토리의 커스터마이징 대비 과소. 손대는 김에 늘려둘 것.

---

## 3. 업스트림 동기화 런북

```sh
# 0) upstream 리모트 확인 (최초 1회)
git remote get-url upstream || git remote add upstream https://github.com/anomalyco/opencode.git

# 1) 백업 브랜치 (되돌릴 안전망 — 기존 습관 유지)
git checkout dev
git branch dev-backup-pre-upstream-sync-$(date +%Y%m%d)

# 2) upstream 가져와 무엇이 오는지 먼저 검토
git fetch upstream
git log --oneline dev..upstream/dev          # 새로 들어올 커밋
git diff --stat dev...upstream/dev           # 파일 규모

# 3) 머지 (또는 rebase). 충돌 시 인벤토리/`// fork:` 마커 기준으로 우리 것 보존
git merge upstream/dev

# 4) 반드시 4단계 무결성 체크 (아래) 통과 후에만 push
```

충돌 해결 원칙: **인벤토리에 있는 영역 = 우리 것 우선**. upstream이 같은 파일을 크게 바꿨으면, 우리 커스터마이징을 새 코드 위에 **재적용**(단순 "ours" 선택으로 로직 유실 주의).

---

## 4. 동기화 후 무결성 체크 (건너뛰지 말 것)

소실 사고를 잡는 관문. 하나라도 실패하면 push 금지.

```sh
# (a) 빌드/타입 — 패키지 디렉토리에서, 루트 금지 (guard: do-not-run-tests-from-root)
bun install
bun run typecheck                            # turbo 전 패키지

# (b) 테스트 — config guard 포함(에이전트/커맨드 frontmatter 회귀 감지)
cd packages/opencode && bun test test/config/ && cd ../..
cd packages/tui && bun typecheck && cd ../..

# (c) 커스터마이징 마커 생존 확인
git grep -n "fork:" -- '*.ts' '*.tsx'        # 마킹된 지점 여전한가
git grep -n "opencode-mod"                   # 바이너리 identity 유지되나
test -f packages/opencode/src/session/loop-detect.ts && echo "loop-detect OK"
test -f packages/opencode/src/mcp/claude-code-sources.ts && echo "claude-code MCP OK"

# (d) 인벤토리 표 대조 — 1절 표의 각 항목을 눈으로/grep으로 확인
```

> TODO(권장): (c)를 자동화한 `fork-integrity` 테스트를 추가하면 사람 실수 제거. 예: 인벤토리 핵심 파일 존재 + Go-upsell 부재 + `alwaysSeparate` 선언 존재를 assert.

---

## 5. 선택적 수용 (cherry-pick)

전체 머지 대신 upstream의 특정 개선만 가져올 때:

```sh
git fetch upstream
git log --oneline upstream/dev               # 원하는 커밋 찾기
git cherry-pick <sha>                        # 단건
git cherry-pick <sha1>^..<shaN>              # 범위
```

수용 후에도 **4절 무결성 체크** 동일 적용.

---

## 부록 — 로컬 참조

- 코드 감사 현황: `plans/audit-refresh-2026-07-09.md` (열린 취약점 로드맵 — gitignored, 로컬 전용).
- upstream 대비 전체 diff: `git diff upstream/dev...dev`.
- fork 커밋 로그: `git log upstream/dev..dev --oneline --no-merges`.
