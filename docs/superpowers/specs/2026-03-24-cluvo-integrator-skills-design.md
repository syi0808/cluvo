# Cluvo Integrator Skills Design

> 3개의 독립 skill로 구성된 Cluvo SDK 통합 가이드. 외부 개발자가 자신의 CLI/SDK 프로젝트에 Cluvo를 처음 통합할 때 사용한다.

## Overview

| Skill | 책임 | 완료 후 안내 |
|-------|------|-------------|
| `cluvo-setup` | 패키지 설치 + 기본 연동 | → `cluvo-find-handlers` |
| `cluvo-find-handlers` | 프로젝트 분석 → 에러 핸들링 위치 탐색 → 적절한 레벨 적용 | → `cluvo-custom-config` |
| `cluvo-custom-config` | sanitize, issue, dedupe, store 등 config 튜닝 | 완료 |

**대상 사용자**: Cluvo를 자신의 프로젝트에 처음 통합하려는 외부 개발자
**동작 맥락**: Integrator의 프로젝트에서 Claude Code 등의 AI 도구를 사용할 때
**정보 소스**: 각 skill 파일 안에 Cluvo API를 직접 기술 (외부 참조 없음)
**런타임 지원**: Node.js, Bun (Cluvo가 지원하는 모든 런타임)

---

## Skill 1: `cluvo-setup`

### 목적

`@cluvo/sdk` 패키지를 설치하고, 프로젝트 진입점에 `createReporter` + `wrapCommand` 기본 연동 코드를 삽입한다.

### 트리거 예시

- "cluvo 설치해줘"
- "cluvo 연동해줘"
- "bug reporting 추가해줘"

### 수행 순서

1. **런타임 감지** — Node.js / Bun 판별
2. **패키지 매니저 감지** — npm / yarn / pnpm / bun (lockfile 기반)
3. **`@cluvo/sdk` 설치**
4. **진입점 탐색** — `package.json`의 `main`/`bin` 필드, 또는 일반적 패턴 (`src/index.ts`, `src/cli.ts` 등)
5. **기본 연동 코드 삽입**:
   - `createReporter({ repo, app: { name, version } })` — `package.json`에서 자동 추출
   - `wrapCommand(fn)` 으로 CLI 진입점 래핑
6. **완료 메시지 + 다음 스텝 안내**

### 삽입 코드 예시

```typescript
import { createReporter } from '@cluvo/sdk'

const cluvo = createReporter({
  repo: 'owner/repo',
  app: { name: 'my-cli', version: '1.0.0' },
})

await cluvo.wrapCommand(async () => {
  // 기존 CLI 진입점
})
```

### 내장 API 레퍼런스

- `createReporter(config: ReporterConfig): Reporter` — 필수 옵션: `repo` (string), `app` ({ name: string, version: string })
- `reporter.wrapCommand(fn: () => Promise<void>): Promise<void>` — 에러 자동 포착 → 사니타이즈 → 프롬프트 → 제출. 처리 후 원래 에러를 다시 throw하므로 프로세스는 정상적으로 에러 종료됨
- `reporter.installGlobalHandlers(): () => void` — uncaught exception / unhandled rejection 리스너 등록, 반환값은 해제 함수

---

## Skill 2: `cluvo-find-handlers`

### 목적

프로젝트 코드를 분석하여 에러 핸들링 위치를 찾고, 각 위치에 적절한 Cluvo API 레벨(manual / low-level)을 추천하고 적용한다.

### 트리거 예시

- "에러 핸들링 위치 찾아줘"
- "cluvo 수동 연동"
- "reportError 적용해줘"

### 수행 순서

1. **전제 확인** — `@cluvo/sdk` 설치 여부. 미설치 시 `cluvo-setup` 안내
2. **기존 설정 파악** — 프로젝트 내 `createReporter` 호출을 찾아 인스턴스 재사용
3. **코드 분석**:
   - `try/catch` 블록 탐색
   - 프로세스 에러 핸들러 (`process.on('uncaughtException')` 등) 탐색
   - 에러를 throw 하거나 reject 하는 위치 탐색
4. **레벨 추천**:
   - 이미 `try/catch`로 잡고 있는 곳 → `reportError(error, context)` + `promptAndSubmit(report)`
   - 글로벌 핸들러 부재 → `installGlobalHandlers()` 추천
   - 세밀한 파이프라인 제어 필요 → low-level API 추천
5. **사용자 확인 후 코드 적용**
6. **완료 메시지 + 다음 스텝 안내**

### 내장 API 레퍼런스

#### Manual Level

```typescript
try {
  await riskyOperation()
} catch (error) {
  const report = await cluvo.reportError(error, {
    command: 'deploy',
    subcommand: 'production',
    argv: process.argv.slice(2),
    metadata: { region: 'ap-northeast-2' },
  })
  await cluvo.promptAndSubmit(report)
}
```

- `reportError(error: unknown, context?: ErrorContext): Promise<ErrorReport>` — 절대 throw하지 않음, 최소 fallback 반환
- `promptAndSubmit(report: ErrorReport): Promise<void>` — TTY면 인터랙티브 프롬프트, 아니면 nonInteractive 설정에 따라 동작
- `installGlobalHandlers(): () => void` — uncaught exception / unhandled rejection 자동 포착

#### ErrorContext

```typescript
interface ErrorContext {
  command?: string
  subcommand?: string
  argv?: string[]
  metadata?: Record<string, unknown>
}
```

#### Low-Level Pipeline

```typescript
const report = cluvo.buildReport(error, context)
const sanitized = cluvo.sanitizeReport(report)
const matchResult = await cluvo.findMatches(sanitized)
const enriched = matchResult.found
  ? { ...sanitized, matches: matchResult.matches }
  : sanitized
const draft = cluvo.buildDraft(enriched)
const result = await cluvo.publish(draft)
```

---

## Skill 3: `cluvo-custom-config`

### 목적

프로젝트에 맞게 `createReporter` config를 튜닝한다. Sanitize 규칙, issue 라벨/포맷, store, dedupe 등을 설정한다.

### 트리거 예시

- "cluvo 설정 커스텀해줘"
- "sanitize 규칙 추가해줘"
- "issue 라벨 설정해줘"

### 수행 순서

1. **기존 config 파악** — 프로젝트 내 `createReporter` 호출에서 현재 설정 확인
2. **커스텀 영역 질문** — 아래 영역 중 어떤 것을 변경할지 확인:
   - Sanitize — 커스텀 규칙 추가
   - Issue — 라벨, 타이틀 포맷, 섹션, 템플릿
   - Dedupe — 중복 탐색 설정
   - Store — 로컬 저장 설정
   - Collect — 수집 항목 토글
   - Mode — 퍼블리시 방식
   - Non-interactive — non-TTY 동작
3. **config 수정 적용**

### 내장 API 레퍼런스

#### ReporterConfig 전체 옵션

```typescript
interface ReporterConfig {
  // 필수
  repo: string                          // GitHub org/repo
  app: { name: string, version: string, gitSha?: string }

  // 퍼블리시
  mode?: 'browser' | 'gh' | 'api' | 'file'  // 기본: 'browser'

  // 인터랙션
  interactive?: 'auto' | 'never'       // 기본: 'auto' (TTY 감지)
  nonInteractive?: 'save' | 'silent' | 'log'  // 기본: 'save'

  // 수집
  collect?: {
    argv?: boolean                      // 기본: true
    diagnosticReport?: boolean          // 기본: false
    envinfo?: boolean                    // 기본: true
  }

  // 사니타이즈
  sanitize?: {
    enabled?: boolean                   // 기본: true
    customRules?: SanitizeRule[]
  }

  // 중복 탐색
  dedupe?: {
    enabled?: boolean                   // 기본: true
    searchDiscussions?: boolean         // 기본: false
  }

  // 이슈 포맷
  issue?: {
    labels?: string[]                   // 기본: ['cluvo-report']
    title?: (ctx: { command?: string; error: ErrorPayload }) => string
    sections?: string[]                 // 기본: DEFAULT_SECTIONS
    template?: string
  }

  // 로컬 저장
  store?: {
    enabled?: boolean                   // 기본: true
    maxReports?: number                 // 기본: 100
  }

  // 프롬프트
  prompt?: {
    message?: string
    detailMessage?: string
  }

  // 브랜딩
  branding?: {
    showName?: boolean                  // 기본: false
  }
}
```

#### SanitizeRule 인터페이스

```typescript
interface SanitizeRule {
  name: string          // 규칙 이름 (예: 'internal-api-url')
  pattern: RegExp       // 매칭 패턴
  replacement: string   // 대체 문자열 (예: '[INTERNAL_URL]')
}
```

#### 기본 Sanitize 규칙 목록

| 이름 | 대상 |
|------|------|
| bearer-token | Bearer 토큰 |
| github-token | GitHub 토큰 (ghp_, ghs_) |
| generic-api-key | API 키 패턴 |
| password | 비밀번호 필드 |
| email | 이메일 주소 |
| home-path | 홈 디렉토리 경로 |
| private-key | PEM 프라이빗 키 |
| sk-token | sk- 접두사 토큰 |
| sensitive-argv | 민감 CLI 인자 (별도 메커니즘: `ARGV_SENSITIVE_FLAGS`로 처리, `SanitizeRule` 파이프라인과 독립) |

#### DEFAULT_SECTIONS

`summary`, `environment`, `command`, `stackTrace`, `causeChain`, `sanitizedNotice`

---

## Skill 간 관계

```
cluvo-setup ──"더 세밀한 에러 핸들링이 필요하면"──→ cluvo-find-handlers
cluvo-find-handlers ──"config를 튜닝하려면"──→ cluvo-custom-config
```

각 skill은 독립적으로 사용할 수 있으며, 순서대로 진행할 필요는 없다. 다만 `cluvo-find-handlers`와 `cluvo-custom-config`는 `@cluvo/sdk`가 이미 설치·설정된 상태를 전제로 한다.

## 설계 원칙

- **각 skill은 단일 책임** — setup은 설치만, find-handlers는 탐색/적용만, custom-config는 설정만
- **API 정보는 skill 내장** — 외부 파일 참조 없이 각 skill이 필요한 API를 직접 기술
- **런타임 무관** — Node.js, Bun 모두 지원
- **비파괴적** — 기존 코드를 최대한 보존하며 Cluvo 코드를 삽입
- **다음 스텝 안내** — 각 skill 완료 시 자연스럽게 다음 단계를 제안
