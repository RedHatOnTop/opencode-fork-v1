# opencode-fork-v1

> 친구들을 위한 개인 포크 에디션 🚀

---

## 이 포크는 무엇인가?

이 저장소는 [opencode](https://github.com/anomalyco/opencode)의 개인 포크입니다. 원본 프로젝트의 핵심 기능을 그대로 유지하면서, 개인 사용 및 친구들과의 공유를 목적으로 커스터마이징했습니다.

**버전:** `1.14.28-fork.1` (업스트림 버전 + 포크 버전)

---

## 업스트림과의 차이점

| 항목 | 설명 |
|------|------|
| **CI/CD 워크플로우** | 자동 배포 워크플로우 비활성화 (수동 빌드/배포) |
| **버전 스킴** | `{upstream_version}-fork.{n}` 형식 사용 |
| **보안 패치** | 업스트림에 아직 반영되지 않은 보안 수정 사항 선적용 |
| **설치 스크립트** | 원클릭 설치 스크립트 추가 (`install.ps1`, `install.sh`) |
| **기본 설정** | 한국어 환경에 맞게 기본값 조정 |

---

## 빠른 설치

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/RedHatOnTop/opencode-fork-v1/dev/install.ps1 | iex
```

### Linux / macOS

```bash
curl -fsSL https://raw.githubusercontent.com/RedHatOnTop/opencode-fork-v1/dev/install.sh | bash
```

또는 wget 사용:

```bash
wget -qO- https://raw.githubusercontent.com/RedHatOnTop/opencode-fork-v1/dev/install.sh | bash
```

> 설치 후 터미널을 재시작하면 `opencode-fork` 명령어를 사용할 수 있습니다.

---

## 수동 설치

### 필수 요구사항

- [Bun](https://bun.sh) v1.3.13+
- [Git](https://git-scm.com)
- Linux/macOS: C 컴파일러 (gcc, clang 등 — 네이티브 모듈 빌드용)

### 설치 단계

```bash
# 1. 저장소 클론
git clone --depth 1 -b dev https://github.com/RedHatOnTop/opencode-fork-v1.git ~/.opencode-fork
cd ~/.opencode-fork

# 2. 의존성 설치
bun install

# 3. CLI 빌드
cd packages/opencode
bun run build

# 4. 심볼릭 링크 생성 (Linux/macOS)
mkdir -p ~/.local/bin
ln -s ~/.opencode-fork/packages/opencode/bin/opencode ~/.local/bin/opencode-fork

# Windows의 경우 PATH에 bin 디렉토리를 수동 추가하세요
```

### 업데이트

```bash
cd ~/.opencode-fork
git pull
bun install
cd packages/opencode && bun run build
```

또는 설치 스크립트를 다시 실행하면 자동으로 업데이트됩니다.

---

## 프로바이더 설정

opencode는 여러 AI 프로바이더를 지원합니다. 설정 파일은 `~/.opencode/config.json`에 위치합니다.

### Anthropic (Claude)

```json
{
  "provider": {
    "anthropic": {
      "apiKey": "sk-ant-..."
    }
  }
}
```

또는 환경 변수 사용:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### OpenAI

```json
{
  "provider": {
    "openai": {
      "apiKey": "sk-..."
    }
  }
}
```

또는 환경 변수 사용:

```bash
export OPENAI_API_KEY="sk-..."
```

### 기타 프로바이더

Google Gemini, Azure OpenAI, 로컬 모델(Ollama) 등도 지원합니다. 자세한 설정은 [업스트림 문서](https://github.com/anomalyco/opencode)를 참고하세요.

> **팁:** API 키는 환경 변수로 설정하는 것이 보안상 더 안전합니다. `.bashrc`나 `.zshrc`에 추가해 두면 편리합니다.

---

## 기본 사용법

### 세션 시작

```bash
# 현재 디렉토리에서 시작
opencode-fork

# 특정 프로젝트 디렉토리에서 시작
opencode-fork --cwd /path/to/project
```

### 대화형 모드

시작 후 프롬프트에 메시지를 입력하세요:

```
> 이 프로젝트의 구조를 설명해줘
> src/index.ts 파일을 리팩토링해줘
> 테스트 코드를 작성해줘
```

### 주요 명령어

| 명령 | 설명 |
|------|------|
| `opencode-fork` | 대화형 세션 시작 |
| `opencode-fork --help` | 도움말 보기 |
| `opencode-fork --version` | 버전 확인 |
| `opencode-fork -p "메시지"` | 단일 프롬프트 실행 (비대화형) |

### 도구 사용

opencode는 자동으로 다음 도구들을 사용할 수 있습니다:

- **파일 읽기/쓰기** — 프로젝트 파일 조작
- **셸 명령 실행** — 빌드, 테스트, Git 등
- **코드 검색** — 프로젝트 내 코드 검색
- **웹 검색** — 필요시 외부 정보 조회

---

## 자주 묻는 질문

### Q: 설치 후 `opencode-fork` 명령어를 찾을 수 없어요

**A:** 터미널을 재시작하거나, 셸 설정을 다시 로드하세요:

```bash
# bash
source ~/.bashrc

# zsh
source ~/.zshrc
```

Windows에서는 PowerShell을 재시작하세요.

### Q: 빌드 중 네이티브 모듈 에러가 발생해요

**A:** Linux에서는 빌드 도구가 필요합니다:

```bash
# Ubuntu/Debian
sudo apt install build-essential

# Fedora
sudo dnf install gcc make
```

macOS에서는 Xcode Command Line Tools를 설치하세요:

```bash
xcode-select --install
```

### Q: 업데이트는 어떻게 하나요?

**A:** 설치 스크립트를 다시 실행하면 자동으로 업데이트됩니다. 수동 업데이트는 위의 [업데이트](#업데이트) 섹션을 참고하세요.

### Q: 원본 opencode와 충돌하나요?

**A:** 아니요. 이 포크는 `opencode-fork`라는 별도 명령어로 설치되므로, 원본 opencode와 독립적으로 사용할 수 있습니다.

### Q: API 키는 어디에 설정하나요?

**A:** `~/.opencode/config.json` 파일에 설정하거나, 환경 변수(`ANTHROPIC_API_KEY`, `OPENAI_API_KEY` 등)를 사용하세요. 자세한 내용은 [프로바이더 설정](#프로바이더-설정) 섹션을 참고하세요.

### Q: Bun 설치는 어떻게 하나요?

**A:** 설치 스크립트가 자동으로 설치합니다. 수동 설치:

```bash
# Linux/macOS
curl -fsSL https://bun.sh/install | bash

# Windows (PowerShell)
irm bun.sh/install.ps1 | iex
```

---

## 기여

이 포크는 친구들과 함께 사용하는 개인 프로젝트입니다. 버그 리포트나 개선 제안은 언제든 환영합니다!

### 이슈 리포트

- [GitHub Issues](https://github.com/RedHatOnTop/opencode-fork-v1/issues)에 이슈를 등록해 주세요
- 가능하면 재현 단계, OS 정보, 에러 메시지를 포함해 주세요

### 개선 제안

- 이슈에 `enhancement` 라벨로 제안을 등록해 주세요
- 카카오톡/디스코드로 직접 알려주셔도 됩니다 😄

---

## 라이선스

이 포크는 업스트림 [opencode](https://github.com/anomalyco/opencode)과 동일한 **MIT** 라이선스를 따릅니다.
