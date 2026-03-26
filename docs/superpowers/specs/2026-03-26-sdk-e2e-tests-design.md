# SDK E2E Tests Design

## Overview

SDK가 실제 통합된 환경에서 올바르게 동작하는지 검증하는 E2E 테스트 스위트. SDK API 레벨 테스트와 subprocess 기반 테스트의 이중 구조로, 총 ~122개 시나리오를 커버한다.

## Goals

- SDK의 전체 파이프라인(Error -> Collector -> Sanitizer -> Store -> Matcher -> Formatter -> Presenter -> Publisher)이 통합 환경에서 올바르게 동작하는지 검증
- 실제 프로세스 레벨에서 stdout/stderr/exitCode를 포함한 동작 검증
- 다양한 환경(로컬 개발, CI, 파이프, 디버그, 민감정보 환경)에서의 동작 보장
- 과거 버그(무한루프, timer 미정리, dismissed 마킹 누락)의 회귀 방지

## Non-Goals

- 실제 GitHub에 이슈를 생성하는 테스트 (fetch mock으로 대체)
- 실제 TTY 입력을 시뮬레이션하는 인터랙티브 프롬프트 테스트
- 성능/부하 테스트

## Architecture

```
test/e2e/
├── sdk-api/                # createReporter() API를 직접 호출
│   ├── reporting.test.ts
│   ├── sanitization.test.ts
│   ├── dedup.test.ts
│   ├── publishing.test.ts
│   ├── nested.test.ts
│   ├── config.test.ts
│   └── lifecycle.test.ts
├── subprocess-sdk/         # bun run으로 SDK 스크립트 실행
│   ├── reporting.test.ts
│   ├── sanitization.test.ts
│   ├── publishing.test.ts
│   ├── dedup.test.ts
│   ├── nested.test.ts
│   ├── lifecycle.test.ts
│   └── config.test.ts
├── subprocess-cli/         # bun run cluvo 커맨드 실행
│   ├── list-show.test.ts
│   ├── submit.test.ts
│   └── clean-dismiss.test.ts
└── helpers/
    ├── environments.ts
    ├── mock-fetch.ts
    ├── fixtures.ts
    ├── subprocess.ts
    └── test-presenter.ts
```

### Testing Strategy

SDK API 레벨에서 mock presenter/fetch로 빠르게 검증한 뒤, subprocess 레벨에서 동일 시나리오를 실제 프로세스로 재검증하는 이중 구조.

- **SDK API 테스트**: in-process. mock presenter와 mock fetch로 파이프라인 로직 검증. 빠르고 디버깅 쉬움.
- **Subprocess SDK 테스트**: out-of-process. 인라인 스크립트를 `bun run`으로 실행. stdout/stderr/exitCode/store 파일을 검증. 실제 사용 환경과 동일.
- **Subprocess CLI 테스트**: out-of-process. `cluvo` CLI 바이너리를 실행. CLI 커맨드의 입출력 검증.

### Mocking Strategy

- **GitHub API**: `globalThis.fetch`를 mock하여 search/issue create 응답 제어
- **파일시스템**: 각 테스트마다 `mkdtemp()`으로 격리된 store 디렉토리 생성, `_storeDir` 옵션으로 주입
- **TTY**: subprocess 테스트에서는 pipe로 실행하므로 자연스럽게 non-interactive
- **환경변수**: 환경 fixture preset으로 제어

## Shared Helpers

### environments.ts — 환경 Fixture Presets

```typescript
interface TestEnvironment {
  name: string
  env: Record<string, string | undefined>
  isTTY: boolean
  argv?: string[]
  description: string
}
```

7가지 환경 preset:

| Preset | TTY | Token | CI | 용도 |
|--------|-----|-------|----|------|
| `localDev` | true | none | no | 기본 로컬 개발 |
| `localDevWithToken` | true | ghp_... | no | 토큰 있는 로컬 |
| `ciGitHub` | false | ghp_... | GitHub Actions | CI + 토큰 |
| `ciGeneric` | false | none | generic | CI, 토큰 없음 |
| `pipe` | false | none | no | 파이프된 출력 |
| `debug` | true | none | no | CLUVO_DEBUG=1 |
| `sensitiveEnv` | true | ghp_... | no | 민감 환경변수 다수 (AWS, DB, API_KEY) |

### mock-fetch.ts — GitHub API Mock

```typescript
interface MockGitHubOptions {
  searchResults?: ExistingIssue[]
  createIssueUrl?: string
  createIssueError?: number
  searchError?: number
  latency?: number
}

function createMockFetch(options: MockGitHubOptions): typeof fetch
function installMockFetch(options: MockGitHubOptions): () => void
```

### fixtures.ts — 에러 객체 및 Config 조합

에러 fixtures:
- `simple` — 기본 Error
- `withCause` — 2단 cause chain
- `deepCause` — 3단 cause chain
- `typeError` — TypeError
- `customError` — 커스텀 에러 클래스 (code 속성)
- `nonError` — string throw
- `nullError` — null throw
- `circular` — circular reference
- `withSensitive` — 민감정보 포함 메시지

Config fixtures:
- `minimal` — 최소 필수값만
- `cliPreset` / `sdkPreset` — 프리셋 적용
- `customLabels` — 커스텀 라벨
- `noSanitize` / `noStore` / `noDedupe` — 개별 기능 비활성화
- `customTitle` — 커스텀 타이틀 함수
- `fileModeOnly` — mode='file'
- `nonInteractiveSave` / `nonInteractiveSilent` / `nonInteractiveLog` — nonInteractive 모드별

### subprocess.ts — 프로세스 실행 유틸

```typescript
interface RunResult {
  exitCode: number
  stdout: string
  stderr: string
}

async function runScript(code: string, env?: TestEnvironment): Promise<RunResult>
async function runCluvo(args: string[], env?: TestEnvironment): Promise<RunResult>
async function seedReports(storeDir: string, reports: Partial<ErrorReport>[]): Promise<void>
async function readReports(storeDir: string, appName: string): Promise<ErrorReport[]>
```

### test-presenter.ts — 프로그래밍 가능한 Presenter

```typescript
function createTestPresenter(
  action: PresenterAction | PresenterAction[] | null
): PresenterAdapter
```

## Test Scenarios

### SDK API Level (57 scenarios)

#### sdk-api/reporting.test.ts (13 scenarios)

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | `reportError()` basic flow | ErrorReport returned with id/createdAt, status='pending', saved to store |
| 2 | `reportAndPrompt()` -> presenter returns 'open' | publish(browser) called, status='submitted' |
| 3 | `reportAndPrompt()` -> presenter returns 'cancel' | status='dismissed', publish not called |
| 4 | `reportAndPrompt()` -> presenter returns 'save' | status stays 'pending', exists in store |
| 5 | `wrap()` with error | error captured + reportAndPrompt called + error rethrown |
| 6 | `wrap()` no error | completes normally, no report created |
| 7 | `wrapCommand()` extracts context from process.argv | report.command has command/subcommand/argv |
| 8 | `buildReport()` standalone | returns ErrorReport, not saved to store, not sanitized |
| 9 | same Error object -> `reportError()` x2 | same report id returned (dedup) |
| 10 | primitive error (string, null) | handled normally, error.message = String() value |
| 11 | error with cause chain | error.causeChain array contains full chain |
| 12 | error with circular reference | no crash, normal report generated |
| 13 | `reportError()` never throws | returns minimal report even on internal collector failure |

#### sdk-api/sanitization.test.ts (8 scenarios)

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | GitHub token in error message | replaced with [REDACTED], sanitizedFields recorded |
| 2 | AWS key, DB URL, API key in environment | not exposed in report |
| 3 | HOME path in stack trace | replaced with ~ |
| 4 | argv values after --token, --api-key | sensitive flag values redacted |
| 5 | custom sanitize rule | user-defined regex applied |
| 6 | sanitize disabled | original preserved, sanitizedFields empty |
| 7 | sensitiveEnv full pipeline | stored report + draft body both clean |
| 8 | email in error message | masked |

#### sdk-api/dedup.test.ts (7 scenarios)

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | GitHub search finds similar issues | report.matches populated, passed to presenter |
| 2 | user selects 'react' on existing issue | reaction attempted, no new issue created |
| 3 | user selects 'view' on existing issue | issue URL opened, no new issue |
| 4 | no matches found | matches is empty array, normal publish proceeds |
| 5 | search API failure (network error) | graceful — matches as empty, flow continues |
| 6 | dedupe disabled | search not called, matches undefined |
| 7 | searchDiscussions: true | discussions included in query |

#### sdk-api/publishing.test.ts (9 scenarios)

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | mode='browser' success | method='browser', URL generated |
| 2 | browser URL > 8000 chars -> file fallback | method='file', filePath exists |
| 3 | mode='api' + token present | method='api', issueUrl returned |
| 4 | mode='api' + no token -> file fallback | method='file' |
| 5 | mode='gh' + gh unavailable -> api -> file | fallback chain order verified |
| 6 | mode='file' explicitly | method='file', markdown file created |
| 7 | post-publish store status='submitted' + issueUrl | verified by store query |
| 8 | custom labels in draft | labels included in publish request |
| 9 | custom title function | draft.title matches custom format |

#### sdk-api/nested.test.ts (6 scenarios)

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | absorb: child error -> parent presenter | parent presenter called, child presenter not called |
| 2 | absorb: stored in both child and parent store | report exists in both stores |
| 3 | passthrough: child uses own presenter | child presenter called, parent not called |
| 4 | silent: store only, no prompt | no presenter called, stored in child store |
| 5 | 3-level nesting (grandparent -> parent -> child) absorb | reaches grandparent presenter |
| 6 | child alone without parent (sdk preset) | works normally, no crash on missing parent |

#### sdk-api/config.test.ts (7 scenarios)

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | cli preset defaults | interactive='auto', collect.argv=true, command section present |
| 2 | sdk preset defaults | interactive='never', collect.argv=false, presenter=null |
| 3 | preset + individual override | override takes precedence |
| 4 | collect.diagnosticReport=true | report.diagnostic has heap/uptime |
| 5 | store.maxReports=3 -> 4th save evicts | oldest submitted deleted |
| 6 | store.enabled=false | nothing written to filesystem |
| 7 | all options minimal (sanitize/dedupe/store off) | pipeline works normally |

#### sdk-api/lifecycle.test.ts (7 scenarios)

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | installGlobalHandlers() + uncaughtException | reportError called, metadata.origin='uncaughtException' |
| 2 | installGlobalHandlers() + unhandledRejection | reportError called, metadata.origin='unhandledRejection' |
| 3 | after uninstall, error occurs | reportError not called |
| 4 | installExitHandler() + pending report exists | promptAndSubmit called on beforeExit |
| 5 | exit handler timeout exceeded | normal exit after timeout, timer cleaned up |
| 6 | non-interactive exit handler marks dismissed | store status='dismissed' (regression: past bug) |
| 7 | user decline doesn't cause infinite loop | single decline then exit (regression: past bug) |

### Subprocess SDK Level (50 scenarios)

#### subprocess-sdk/reporting.test.ts (11 scenarios)

| # | Scenario | Env | Assertion |
|---|----------|-----|-----------|
| 1 | reportError() -> nonInteractive='save' | pipe | stdout has path, store file has valid ErrorReport |
| 2 | reportAndPrompt() -> nonInteractive='save' | pipe | saved to store, status verified |
| 3 | reportAndPrompt() -> nonInteractive='silent' | pipe | no output, saved to store |
| 4 | reportAndPrompt() -> nonInteractive='log' | pipe | stderr has path |
| 5 | wrap() + error thrown | pipe | exitCode!=0, report in store |
| 6 | wrap() + no error | pipe | exitCode=0, store empty |
| 7 | wrapCommand() + argv context | pipe | store report.command has argv |
| 8 | same error x2 reportError() | pipe | 1 report in store (dedup) |
| 9 | primitive error (string throw) | pipe | store has normal report |
| 10 | cause chain error | pipe | causeChain length verified in store |
| 11 | reportError() never crashes process | pipe | exitCode=0 even on internal failure |

#### subprocess-sdk/sanitization.test.ts (7 scenarios)

| # | Scenario | Env | Assertion |
|---|----------|-----|-----------|
| 1 | GitHub token in error message | sensitiveEnv | no token in store file |
| 2 | HOME path in stack trace | sensitiveEnv | ~ substitution in store file |
| 3 | --token value in argv | sensitiveEnv | redacted in store report |
| 4 | AWS_SECRET, DB_URL in env | sensitiveEnv | not in report anywhere |
| 5 | custom sanitize rule | pipe | custom pattern redacted |
| 6 | sanitize disabled | pipe | original preserved in store |
| 7 | full pipeline -> file export, sensitive env | sensitiveEnv | draft file (markdown) also clean |

#### subprocess-sdk/publishing.test.ts (6 scenarios)

| # | Scenario | Env | Assertion |
|---|----------|-----|-----------|
| 1 | mode='file' -> file created | pipe | drafts/ has markdown, content verified |
| 2 | mode='api' + token + mock success | localDevWithToken | exitCode=0, store status='submitted' |
| 3 | mode='api' + no token -> file fallback | pipe | drafts/ file created |
| 4 | mode='browser' + body > 8000 chars -> file | pipe | file fallback works |
| 5 | post-publish store status/issueUrl update | localDevWithToken | store file verified |
| 6 | custom labels in draft | pipe | file export includes labels |

#### subprocess-sdk/dedup.test.ts (3 scenarios)

| # | Scenario | Env | Assertion |
|---|----------|-----|-----------|
| 1 | mock fetch returns similar issues | pipe | store report.matches has issues |
| 2 | search API failure (fetch throws) | pipe | no crash, report created normally |
| 3 | dedupe disabled | pipe | no fetch call, matches undefined |

#### subprocess-sdk/nested.test.ts (6 scenarios)

| # | Scenario | Env | Assertion |
|---|----------|-----|-----------|
| 1 | absorb: child error -> parent handles | pipe | report in parent store and child store |
| 2 | passthrough: child handles independently | pipe | child store has report with nonInteractive behavior |
| 3 | silent: store only | pipe | no output, child store has report |
| 4 | parent + child each error | pipe | both reports in respective stores |
| 5 | child alone (no parent) | pipe | no crash, normal operation |
| 6 | 3-level nesting absorb chain | pipe | reaches top-level parent store |

#### subprocess-sdk/lifecycle.test.ts (10 scenarios)

| # | Scenario | Env | Assertion |
|---|----------|-----|-----------|
| 1 | global handler + uncaughtException | pipe | report in store, metadata.origin verified |
| 2 | global handler + unhandledRejection | pipe | same |
| 3 | global handler uninstalled, then error | pipe | store empty |
| 4 | exit handler + pending report | pipe | report processed before exit |
| 5 | exit handler + nonInteractive='silent' | pipe | silent processing, clean exit |
| 6 | exit handler not installed + pending | pipe | report stays pending |
| 7 | exit handler timeout exceeded | pipe | process exits within 5s |
| 8 | non-interactive dismissed marking | pipe | store status='dismissed' (regression) |
| 9 | user decline no infinite loop | pipe | process exits within 5s (regression) |
| 10 | timer cleanup (no hanging process) | pipe | process exits cleanly, no hanging (regression) |

#### subprocess-sdk/config.test.ts (7 scenarios)

| # | Scenario | Env | Assertion |
|---|----------|-----|-----------|
| 1 | cli preset default behavior | pipe | store report has argv, appropriate sections |
| 2 | sdk preset default behavior | pipe | no argv, interactive='never' |
| 3 | preset + override combination | pipe | override applied |
| 4 | collect.diagnosticReport=true | pipe | store report.diagnostic exists |
| 5 | store.maxReports=2, save 3rd | pipe | only 2 in store, eviction worked |
| 6 | store.enabled=false | pipe | no files in store directory |
| 7 | all options off | pipe | no crash, clean exit |

### Subprocess CLI Level (15 scenarios)

#### subprocess-cli/list-show.test.ts (6 scenarios)

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | `cluvo list` with 3 reports | stdout shows 3 reports, exitCode=0 |
| 2 | `cluvo list` with no reports | "No reports found" message, exitCode=0 |
| 3 | `cluvo list` with mixed apps | grouped by app in output |
| 4 | `cluvo show <id>` existing | report detail output (error, environment, status) |
| 5 | `cluvo show <id>` non-existent | error message, exitCode!=0 |
| 6 | `cluvo list --status pending` | only pending reports filtered |

#### subprocess-cli/submit.test.ts (4 scenarios)

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | `cluvo submit <id>` mode=file | file created, status='submitted' |
| 2 | `cluvo submit <id>` already submitted | error/warning message |
| 3 | `cluvo submit <id>` dismissed report | error/warning message |
| 4 | `cluvo submit` no id | usage hint, exitCode!=0 |

#### subprocess-cli/clean-dismiss.test.ts (5 scenarios)

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | `cluvo dismiss <id>` | status='dismissed' in store |
| 2 | `cluvo dismiss <id>` already dismissed | no error (idempotent) |
| 3 | `cluvo clean` with submitted+dismissed | those removed, pending preserved |
| 4 | `cluvo clean` empty store | no error, clean exit |
| 5 | `cluvo clean --older-than 7d` | only old reports removed |

## Summary

| Area | SDK API | Subprocess SDK | Subprocess CLI | Total |
|------|---------|----------------|----------------|-------|
| reporting | 13 | 11 | - | 24 |
| sanitization | 8 | 7 | - | 15 |
| dedup | 7 | 3 | - | 10 |
| publishing | 9 | 6 | - | 15 |
| nested | 6 | 6 | - | 12 |
| config | 7 | 7 | - | 14 |
| lifecycle | 7 | 10 | - | 17 |
| CLI commands | - | - | 15 | 15 |
| **Total** | **57** | **50** | **15** | **~122** |
