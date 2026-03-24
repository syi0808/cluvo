# Cluvo MVP (v0.1) Design Spec

## Overview

Cluvo는 오픈소스 CLI/SDK에서 발생한 오류를 로컬에서 수집, 정리, 마스킹하고 사용자가 검토 가능한 구조화된 GitHub 이슈 초안으로 전환해주는 SDK다.

---

## Decisions

| 항목 | 결정 |
|------|------|
| Runtime/Build | Bun (패키지 매니저 + 런타임 + 빌드) |
| Test | `bun test` (내장 테스트러너) |
| CLI UX 라이브러리 | 직접 구현 (stdin/stdout 제어) |
| 배포 형태 | monorepo (`@cluvo/core`, `@cluvo/cli`, `@cluvo/sdk`) |
| MVP 언어 | Node.js/TypeScript only |
| GitHub Issue 생성 | `gh` CLI + GitHub REST API 둘 다, fallback chain |
| 브라우저 prefill | URL prefill 시도, 8000자 초과 시 fallback |
| interactive 설정 | `'auto' \| 'never'` (기본: auto, TTY 감지 기반) |

---

## UX Principles

1. **Invisible on success** — 성공 경로에서 zero output. Cluvo 존재감 없음.
2. **Minimal on failure** — 에러 뒤 최대 2줄 제안. 원래 CLI 에러 출력을 가리지 않음.
3. **Review before send** — 항상 검토 후 제출. 자동 제출/자동 브라우저 오픈 금지.
4. **Respect execution context** — TTY/CI/pipe 자동 감지. non-interactive 환경에서 prompt 강제하지 않음.
5. **Host-first branding** — Cluvo보다 호스트 CLI 경험 우선. `branding.showName` 기본 false.
6. **Control stays with user** — 취소, 섹션 제외, 저장만 하기 등 제어권은 사용자에게.

Cluvo는 에러 리포팅 도구처럼 보이면 안 되고, 실패 순간에만 조용히 나타나는 "선택 가능한 복구 보조 UX"처럼 느껴져야 한다.

---

## Project Structure

```
cluvo/
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── collector/       # FR-1 에러 캡처, FR-2 환경 수집
│   │   │   ├── sanitizer/       # FR-3 민감정보 마스킹
│   │   │   ├── matcher/         # 중복 이슈 탐색
│   │   │   ├── formatter/       # FR-6 이슈 템플릿 구조화
│   │   │   ├── presenter/       # 검토 UI 렌더링 + 인터랙션
│   │   │   ├── publisher/       # FR-5 GitHub issue, FR-8 로컬 파일, FR-10 실패 복구
│   │   │   ├── store/           # 로컬 에러 저장소 (~/.cluvo/reports/)
│   │   │   ├── diagnostic/      # FR-9 Node 진단 리포트
│   │   │   ├── types.ts         # 공유 데이터 모델
│   │   │   └── index.ts
│   │   ├── test/
│   │   └── package.json
│   ├── cli/
│   │   ├── src/
│   │   ├── test/
│   │   └── package.json
│   └── sdk/
│       ├── src/
│       ├── test/
│       └── package.json
├── package.json                 # workspace root
├── bunfig.toml
├── tsconfig.json
└── PRD.md
```

---

## Data Pipeline

```
Error 발생
  → Collector: ErrorPayload + EnvironmentPayload 생성
  → Sanitizer: 민감정보 마스킹 적용
  → Matcher: 기존 유사 이슈/디스커션 검색
  → Formatter: DraftPayload (title, body, labels) 생성
  → Presenter: 사용자 검토 (interactive 모드에서만)
  → Publisher: GitHub issue / 로컬 파일 / 터미널 출력
```

---

## Data Model

### ErrorReport

파이프라인 전체를 관통하는 리포트 객체.

```ts
interface ErrorReport {
  id: string
  createdAt: string
  app: AppContext
  error: ErrorPayload
  environment: EnvironmentPayload
  command?: CommandContext
  sanitizedFields: string[]
  matches?: ExistingIssue[]
  metadata?: Record<string, unknown>
  status: 'pending' | 'submitted' | 'dismissed'
  submittedAt?: string
  issueUrl?: string
}
```

### ErrorPayload

```ts
interface ErrorPayload {
  name: string
  message: string
  stack?: string
  causeChain?: string[]
}
```

PRD의 `category`, `severity` 필드는 MVP에서 제외. 자동 분류는 v0.2 이후 검토.

### EnvironmentPayload

```ts
interface EnvironmentPayload {
  os: string
  arch: string
  runtimeVersion: string
  shell?: string
  ci?: boolean
  packageManager?: string
}
```

PRD의 `pluginVersions`, `featureFlags` 필드는 MVP에서 제외. `collect.configSummary` opt-in으로 커스텀 메타데이터 수집 가능.

### AppContext

```ts
interface AppContext {
  name: string
  version: string
  runtime: string      // 'node' | 'bun' | ...
  gitSha?: string      // optional release id / git sha
}
```

### CommandContext

```ts
interface CommandContext {
  command?: string
  subcommand?: string
  argv?: string[]   // sanitized
}
```

### DraftPayload

```ts
interface DraftPayload {
  title: string
  body: string      // markdown
  labels?: string[]
}
```

PRD의 `templateId` 필드는 MVP에서 제외. 출력 방식은 `DraftPayload`에 포함하지 않고 Publisher가 config와 fallback chain으로 결정.

### ExistingIssue

```ts
interface ExistingIssue {
  type: 'issue' | 'discussion'
  number: number
  title: string
  url: string
  state: 'open' | 'closed'
  labels: string[]
  createdAt: string
}
```

---

## Module Details

### Collector (FR-1, FR-2)

에러 캡처:
- `captureError(error: unknown): ErrorPayload` — 어떤 값이든 받아서 정규화
  - Error 객체 → name, message, stack 추출
  - string/number → message로 변환, `new Error().stack`으로 fallback stack 생성
  - cause chain → `error.cause` 재귀 탐색하여 `causeChain[]` 생성
- `installGlobalHandlers(callback)` — `uncaughtException`, `unhandledRejection` 등록

환경 수집:
- `collectEnvironment(): EnvironmentPayload`
- `collectApp(config): AppContext`
- `collectCommand(argv?): CommandContext` — sanitized argv

### Sanitizer (FR-3)

기본 마스킹 대상:
- 정규식 패턴: token, api key, bearer, secret, password
- 경로: home directory → `~`, username 포함 경로 → `<USER>`
- email → `***@domain.com`
- 환경변수 값

```ts
type SanitizeRule = {
  name: string
  pattern: RegExp
  replacement: string
}

function sanitize(report: ErrorReport, rules?: SanitizeRule[]): ErrorReport
```

기본 rules + custom rules 병합. 원본 변경하지 않고 새 객체 반환 (immutable).

### Matcher (중복 이슈 탐색)

매칭 전략:
1. GitHub Search API로 `repo:{owner}/{repo} is:issue "{error.name}: {error.message}"` 쿼리
2. `cluvo-report` 라벨이 있는 이슈 우선 탐색
3. relevance 순 최대 5개 반환

```ts
interface MatchResult {
  found: boolean
  matches: ExistingIssue[]
}
```

네트워크 실패 시 조용히 스킵. non-interactive 모드에서는 메타데이터에 기록만.

MVP에서 하지 않는 것: 시맨틱 유사도, stack trace 핑거프린팅, 로컬 캐싱.

### Formatter (FR-6)

기본 섹션: Summary, Steps to Reproduce, Expected/Actual Behavior, Environment, Command, Stack Trace, Additional Context.

- 섹션 on/off, 순서 변경 가능
- `formatTitle(report): string` — Integrator 커스텀 가능
- `formatBody(report, sections?): string` — markdown 반환
- custom markdown section 추가 가능

### Presenter (FR-4)

render, interactive, noninteractive 세 파일로 분리:

- `render.ts` — 요약/상세 텍스트 생성 (순수 함수, I/O 없음). Integrator가 자체 UI에도 사용 가능.
- `interactive.ts` — TTY용 stdin 입력 처리. 2단 구조: 짧은 요약 → `d`로 상세.
- `noninteractive.ts` — CI/pipe용 자동 처리.

Interactive 모드 플로우:

```
에러 출력 (호스트 CLI 원본 그대로)

Prepare a sanitized bug report? (Y/n)
  ↓ Y
── Bug Report ──────────────────────────
[deploy] E403 permission denied
macOS 14.2 · Node 20.11.0 · arm64
Command: deploy prod
3 fields sanitized

Similar issues found:
  #142 [open]  ENOENT when config.yml missing

[v] View #142  [r] React to #142
[o] Open in browser  [g] Create via gh
[s] Save as markdown [d] Details  [c] Cancel
```

Non-interactive 모드:
- `'save'`: `~/.cluvo/reports/`에 저장 + 경로 한 줄 출력
- `'silent'`: 저장만, 출력 없음
- `'log'`: 저장 + stderr에 한 줄 안내

### Publisher (FR-5, FR-8, FR-10)

5가지 출력 전략:
1. **Browser prefill** — `https://github.com/{owner}/{repo}/issues/new?title=...&body=...` URL open. URL 길이 초과 시 다음으로.
2. **gh CLI** — `gh issue create --title --body` subprocess. 미설치/미인증 시 다음으로.
3. **GitHub REST API** — `fetch`로 직접 호출. 토큰 없으면 다음으로.
4. **File export** — markdown/json 파일 저장.
5. **Terminal** — stdout 출력.

Fallback chain: 사용자 선택 or config 기본값 → 실패 시 자동으로 다음 단계 → file + terminal이 최종 fallback (항상 성공).

중복 이슈 관련 동작:
- `v` (view) → 브라우저에서 해당 이슈 열기
- `r` (react) → 해당 이슈에 thumbs-up reaction 추가 (gh CLI 또는 API, 인증 필요)

### Store (로컬 에러 저장소)

저장 구조:

```
~/.cluvo/
├── reports/
│   ├── {app-name}/
│   │   ├── {timestamp}-{id-prefix}.json
│   │   └── ...
│   └── ...
└── config.json   # (향후) 글로벌 설정
```

- sanitize된 데이터만 저장. 민감정보가 디스크에 남지 않음.
- 각 리포트에 `status` 필드로 상태 관리.
- Integrator가 `store.enabled: false`로 비활성화 가능.
- `store.maxReports`로 앱당 최대 저장 수 제한 (기본 100).

### Diagnostic (FR-9)

- `process.report?.getReport()` 호출
- 전체가 아닌 요약만 추출: heap 사용량, active handles, event loop 상태
- opt-in으로만 활성화

---

## SDK API

### ReporterConfig

```ts
type ReporterConfig = {
  repo: string
  app: { name: string; version: string; gitSha?: string }
  mode?: 'browser' | 'gh' | 'api' | 'file'   // 기본 출력 방식. fallback chain 시작점.
  interactive?: 'auto' | 'never'              // 기본: 'auto'
  nonInteractive?: 'save' | 'silent' | 'log'  // 기본: 'save'
  collect?: {
    argv?: boolean
    diagnosticReport?: boolean
    configSummary?: boolean
    envinfo?: boolean
  }
  sanitize?: {
    enabled?: boolean
    customRules?: SanitizeRule[]
  }
  issue?: {
    template?: string
    labels?: string[]
    title?: (ctx: IssueTitleContext) => string
    sections?: string[]
  }
  store?: {
    enabled?: boolean       // 기본: true
    maxReports?: number     // 기본: 100
  }
  dedupe?: {
    enabled?: boolean       // 기본: true
    searchDiscussions?: boolean  // 기본: false
  }
  prompt?: {
    message?: string
    detailMessage?: string
  }
  branding?: {
    showName?: boolean      // 기본: false
  }
}
```

### Reporter API

```ts
const reporter = createReporter(config)

// 고수준 API
await reporter.reportError(error, context)    // collect → sanitize → store
await reporter.promptAndSubmit(report)         // match → present → publish

// 글로벌 핸들러
reporter.installGlobalHandlers()

// 커맨드 래핑
await reporter.wrapCommand(async () => { /* CLI 로직 */ })

// 저수준 API
const report = reporter.buildReport(error, context)
const sanitized = reporter.sanitizeReport(report)
const matches = await reporter.findMatches(sanitized)
const draft = reporter.buildDraft(sanitized)
await reporter.publish(draft)
```

### Behavior Contract

**`reportError(error, context): Promise<ErrorReport>`**
- collect → sanitize → store 수행
- 반환값: sanitized된 `ErrorReport` 객체
- 터미널 인터랙션 없음. I/O 없음 (store 파일 쓰기 제외).
- 절대 throw하지 않음. 내부 에러 시 최소한의 ErrorReport를 반환.

**`promptAndSubmit(report): Promise<void>`**
- match → present → publish 수행
- interactive 모드 결정 테이블:

| `interactive` | TTY? | 동작 |
|---|---|---|
| `'auto'` | yes | interactive prompt |
| `'auto'` | no | `nonInteractive` 설정에 따라 동작 |
| `'never'` | any | `nonInteractive` 설정에 따라 동작 |

- interactive 모드: 사용자 검토 → 출력 방식 선택 → publish
- non-interactive 모드: `'save'`(저장+경로출력) / `'silent'`(저장만) / `'log'`(저장+stderr안내)

**`wrapCommand(fn): Promise<void>`**
- `fn()`을 try/catch로 감싸서 실행
- 에러 발생 시: `reportError` → `promptAndSubmit` 순서로 호출
- 원래 에러를 re-throw하여 호스트 CLI의 exit code가 보존됨
- `CommandContext`를 `process.argv`에서 자동 생성

**중복 이슈 reaction (`r` 옵션)**
- `gh` 인증 또는 GitHub 토큰이 없으면 해당 옵션을 표시하지 않음
- 인증 가능 여부는 `promptAndSubmit` 진입 시 한 번 확인

**Report ID 생성**
- `${Date.now()}-${crypto.randomUUID().slice(0, 8)}` 형식
- store 파일명과 동일한 형식 사용

**Store 초과 시 정책**
- `maxReports` 초과 시 `submitted` → `dismissed` → `pending` 순으로 가장 오래된 것부터 삭제

**Browser prefill URL 길이 제한**
- 8000자 초과 시 다음 fallback으로 진행

**Matcher 검색 쿼리 정규화**
- error message에서 파일 경로, 특수문자 제거 후 처음 100자만 사용

---

## CLI Commands

```bash
# 쌓인 에러 목록 조회
cluvo list                    # 전체 pending 리포트
cluvo list --app my-cli       # 특정 앱만
cluvo list --all              # submitted/dismissed 포함

# 상세 보기
cluvo show <id>

# 제출
cluvo submit <id>             # 특정 리포트 → GitHub issue
cluvo submit --all            # pending 전부 (각각 확인)

# 정리
cluvo dismiss <id>
cluvo clean                   # submitted/dismissed 삭제
cluvo clean --older-than 30d
```

---

## Error Handling

**Cluvo 자체의 에러는 절대 호스트 CLI를 죽이지 않는다.** SDK 내부의 모든 에러는 try/catch로 감싸고 조용히 처리.

Publisher fallback chain에서 각 단계 실패 시 다음 단계로 자동 진행. 최종 fallback(file + terminal)까지 실패 시 stderr에 한 줄 경고만. 리포트는 이미 store에 저장되어 데이터 유실 없음.

---

## Test Strategy

`bun test` 사용.

```
packages/core/test/
  collector.test.ts     # 에러 정규화, 환경 수집
  sanitizer.test.ts     # 마스킹 규칙별 테스트
  matcher.test.ts       # 중복 탐색 (API mock)
  formatter.test.ts     # markdown 출력 검증
  presenter.test.ts     # render 순수 함수 테스트
  publisher.test.ts     # fallback chain (subprocess/fetch mock)
  store.test.ts         # 로컬 저장/조회/삭제 (tmp 디렉토리)
  diagnostic.test.ts    # Node report 요약

packages/sdk/test/
  reporter.test.ts      # createReporter, reportError 통합

packages/cli/test/
  commands.test.ts      # list, show, submit, dismiss, clean
```

원칙:
- collector, sanitizer, formatter, render는 순수 함수 → 단위 테스트
- publisher는 외부 I/O → subprocess/fetch mock으로 fallback chain 검증
- store는 임시 디렉토리에 실제 파일 I/O
- CLI 명령어는 stdout 출력 검증

---

## Out of Scope (MVP)

- 서버 기반 이벤트 수집/집계
- 실시간 알림, 대시보드
- 자동 silent submit
- 시맨틱 유사도 비교, stack trace 핑거프린팅
- GitLab/Jira 지원
- Node.js 외 다른 런타임
- 브라우저 웹앱 UI
