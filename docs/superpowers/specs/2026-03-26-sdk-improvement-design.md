# Cluvo SDK Improvement Design

## Overview

Cluvo SDK를 CLI 전용에서 범용 SDK로 개선한다. CLI, SDK/라이브러리, TUI 앱 환경을 모두 지원하도록 preset 시스템, presenter adapter, 전역 reporter 레지스트리를 도입하고, 누락된 편의 API를 추가한다.

## Changes

### 1. Runtime 버전 버그 수정

**문제**: `collect-environment.ts`에서 `process.version`을 그대로 사용. Bun 런타임에서 `process.version`은 Node.js 호환 버전(v24.3.0 등)을 반환하므로 "bun v24.3.0"이라는 잘못된 값이 출력됨.

**수정**: 런타임에 따라 올바른 버전 소스를 사용.

```ts
// collect-environment.ts
runtimeVersion: typeof Bun !== 'undefined' ? Bun.version : process.version
```

**영향 범위**:
- `packages/core/src/collector/collect-environment.ts` — 버전 소스 분기
- `packages/core/src/formatter/sections.ts` — 포맷 변경 없음 (Bun.version은 "1.1.0" 형태, v prefix 없음이 정상)

### 2. Presenter Adapter 인터페이스

기존 presenter가 `process.stdout`/`process.stdin`을 직접 사용하여 TUI 앱에서 사용 불가. Adapter 패턴으로 교체 가능하게 한다.

**인터페이스 정의** (`packages/core/src/types.ts`에 추가):

```ts
interface PresenterAdapter {
  prompt(context: PromptContext): Promise<PresenterAction | null>
}

interface PromptContext {
  report: ErrorReport
  draft: DraftPayload
  authAvailable: boolean  // presenter가 auth 의존 옵션(react 등) 표시 여부를 결정하기 위해 필요
  // presenter가 프롬프트 메시지와 브랜딩을 렌더링하기 위한 설정
  promptMessage?: string     // 커스텀 프롬프트 메시지 (기본: "Prepare a sanitized bug report?")
  branding?: { showName?: boolean }
}

type PresenterAction =
  | { type: 'open' }
  | { type: 'gh' }
  | { type: 'view'; issue: ExistingIssue }
  | { type: 'react'; issue: ExistingIssue }
  | { type: 'save' }
  | { type: 'cancel' }
```

**기존 코드와의 관계**: 기존 `promptAndSubmit`의 `action.type === 'open'`과 `action.type === 'gh'` 분기를 그대로 유지한다. 기존 `PresenterAction`은 단일 인터페이스(`{ type: string; issue?: ExistingIssue }`)였으나, discriminated union으로 변경하여 타입 안전성을 높인다. 이는 내부 타입이므로 외부 소비자에게 영향 없다.

**`'details'` 액션**: 기존 interactive presenter에서 `'d'` 키로 상세 보기를 제공하지만, 이는 presenter 내부에서 재귀적으로 처리되는 UI 동작이므로 `PresenterAction`에 포함하지 않는다. Custom presenter 구현 시에도 details 표시는 presenter 내부 관심사다.

**책임 분리**:
- Presenter: 화면 렌더링 + 사용자 입력(stdin) 감지 → `PresenterAction` 반환
- SDK: 반환된 액션에 맞는 콜백 실행 (publish, save, open 등)

**Built-in Terminal Presenter**:

Import 시점에 원본 `stdout.write`, `stdin`을 저장하고, TUI 환경에서도 best-effort로 동작하는 fallback 전략을 포함한다.

```ts
// SDK import 시점에 원본 참조 저장
const originalStdoutWrite = process.stdout.write.bind(process.stdout)
const originalStdin = process.stdin

class TerminalPresenter implements PresenterAdapter {
  async prompt(context: PromptContext): Promise<PresenterAction | null> {
    const isPatched = process.stdout.write !== originalStdoutWrite

    if (isPatched) {
      // TUI fallback: 커서를 터미널 최하단으로 강제 이동
      const rows = process.stdout.rows || 24
      originalStdoutWrite(`\x1b[${rows};1H\x1b[2K`)
    }

    // 원본 write로 프롬프트 출력
    // 원본 stdin으로 사용자 입력 대기
    // PresenterAction 반환
  }
}
```

| 환경 | stdout 상태 | 동작 |
|------|------------|------|
| 일반 터미널 | 원본 | 그대로 프롬프트 출력 |
| TUI 앱 (에러로 TUI 종료) | 원본 복구됨 | 그대로 프롬프트 출력 |
| TUI 앱 (TUI 진행 중) | 패치됨 | 커서 강제 이동 + 원본 write로 fallback |
| non-TTY (파이프 등) | - | 프롬프트 스킵, null 반환 |

### 3. Preset 시스템

CLI/SDK 환경별 기본 설정을 묶어서 제공한다.

```ts
createReporter({
  preset: 'cli',  // or 'sdk'
  repo: '...',
  app: { name: '...', version: '...' },
  // preset 기본값을 개별 오버라이드 가능
  presenter: myCustomPresenter,
})
```

| 설정 | CLI preset | SDK preset |
|------|-----------|-----------|
| `collect.argv` | `true` | `false` |
| issue 섹션 | summary, environment, **command**, stackTrace, causeChain, sanitizedNotice | summary, environment, stackTrace, causeChain, sanitizedNotice |
| `formatTitle` | `[command] Error: msg` | `Error: msg` |
| `presenter` | built-in TerminalPresenter | `null` |
| `interactive` | `'auto'` (TTY 감지) | `'never'` |

**preset 미지정 시** 기본값은 `'cli'` — 기존 동작과 호환 유지.

**`interactive`와 `presenter`의 우선순위**: `presenter`가 명시적으로 `null`이면 `interactive` 값에 관계없이 프롬프트가 표시되지 않는다. `interactive`는 built-in TerminalPresenter의 동작만 제어한다 (`'auto'`면 TTY일 때만 프롬프트, `'never'`면 항상 스킵). Custom presenter가 설정되면 `interactive` 값은 무시된다.

### 4. 전역 Reporter 레지스트리

여러 라이브러리가 cluvo를 사용하는 중첩 시나리오를 처리한다.

```
CLI App (cluvo reporter A)
  └─ SDK Library (cluvo reporter B)
       └─ Another SDK (cluvo reporter C)
```

**레지스트리 구현** (`packages/sdk/src/registry.ts`):

```ts
// cross-package 공유를 위해 Symbol.for 사용
const REGISTRY_KEY = Symbol.for('cluvo.registry')

interface ReporterRegistry {
  stack: RegisteredReporter[]  // 등록 순서 = 계층
  register(reporter: RegisteredReporter, parentId?: string): void
  unregister(id: string): void
  getParent(reporter: RegisteredReporter): RegisteredReporter | null
}

interface RegisteredReporter {
  id: string
  reporter: Reporter
  childPolicy: 'absorb' | 'passthrough' | 'silent'
}
```

**부모-자식 관계 결정**: `register`에 `parentId`를 명시적으로 지정할 수 있다. 생략 시 스택에서 가장 최근 등록된 reporter를 부모로 간주한다 (선형 중첩 시나리오에서 유용). 형제 관계(A가 B와 C를 각각 사용)에서는 B와 C 모두 `parentId: A.id`를 지정하여 올바른 계층을 형성한다.

**`unregister`**: reporter가 더 이상 사용되지 않을 때 호출. `createReporter`가 반환하는 cleanup 함수에서 자동으로 호출된다.

**childPolicy 소유권**: `childPolicy`는 **상위 reporter**에 속한다. 상위가 "내 하위 reporter들은 이렇게 동작해라"를 선언하는 방식이다. 한 상위의 모든 하위 reporter는 동일한 정책을 따른다.

| childPolicy | 하위 동작 | 상위 동작 |
|-------------|----------|----------|
| `absorb` (기본) | 수집 + sanitize → 상위로 전달 | 자신의 presenter로 프롬프트 |
| `passthrough` | 자신의 presenter로 직접 프롬프트 | 관여 안 함 |
| `silent` | 수집 + store 저장만 | 관여 안 함 |

**absorb 시 상위 전달**:

하위 reporter가 에러를 처리할 때, 레지스트리에서 상위를 조회하고 상위의 childPolicy를 확인한다:

```ts
const parent = registry.getParent(this)
if (parent && parent.childPolicy === 'absorb') {
  // 자체 store에 항상 저장 + 상위로 전달
  const report = await this.reportError(error, context)  // buildReport + sanitize + store
  await parent.reporter.receiveChildReport(report)
  return
}
```

**store 정책**: 모든 reporter는 childPolicy에 관계없이 **항상 자체 store에 에러를 저장**한다. 상위로 전파가 실패하더라도 하위의 store에는 리포트가 남아있어 `cluvo list`로 확인 가능하다. 상위가 `receiveChildReport`로 리포트를 받으면 상위의 store에도 저장하므로, absorb 시 양쪽 store에 모두 존재하게 된다. 이는 의도된 동작으로, 데이터 유실 방지를 우선한다.

### 5. API Surface

```ts
interface Reporter {
  // === High-level API ===
  reportError(error: unknown, context?: ErrorContext): Promise<ErrorReport>
  reportAndPrompt(error: unknown, context?: ErrorContext): Promise<void>
  promptAndSubmit(report: ErrorReport): Promise<void>
  wrap(fn: () => Promise<void>, opts?: WrapOptions): Promise<void>
  wrapCommand(fn: () => Promise<void>, opts?: WrapOptions): Promise<void>  // 모든 preset에서 사용 가능, CLI preset에서 가장 유용
  installGlobalHandlers(): () => void
  installExitHandler(opts?: ExitHandlerOptions): () => void

  // === Low-level API ===
  buildReport(error: unknown, context?: ErrorContext): ErrorReport
  sanitizeReport(report: ErrorReport): ErrorReport
  findMatches(report: ErrorReport): Promise<MatchResult>
  buildDraft(report: ErrorReport): DraftPayload
  publish(draft: DraftPayload): Promise<PublishResult>

  // === 계층 관련 ===
  receiveChildReport(report: ErrorReport): Promise<void>
}

interface WrapOptions {
  rethrow?: boolean  // default: true
}

interface ExitHandlerOptions {
  interceptProcessExit?: boolean  // default: false
  timeout?: number                // default: 30000 (30초). 프롬프트 응답 대기 최대 시간(ms). 초과 시 종료 진행.
}
```

**메서드 관계**:

```
reportError          = buildReport + sanitize + store
reportAndPrompt      = reportError + promptAndSubmit
wrap(fn)             = try/catch + reportAndPrompt + (rethrow)
wrapCommand(fn, opts?)= wrap(fn, opts) + process.argv 컨텍스트 자동 추출 (모든 preset에서 동작, SDK preset에서는 argv가 비어있을 수 있음)
installExitHandler   = beforeExit 리스너 + (옵트인) process.exit 패치
```

**`installGlobalHandlers`와 `installExitHandler`의 상호작용**:

두 핸들러의 역할은 겹치지 않는다:
- `installGlobalHandlers`: catch 안 된 에러 (`uncaughtException`/`unhandledRejection`) → 즉시 `reportAndPrompt` 실행
- `installExitHandler`: catch된 에러에서 `reportError`만 호출된 경우 → 프로세스 종료 직전에 미제출 리포트 프롬프트

`installGlobalHandlers`가 에러를 처리하면 `reportAndPrompt`를 통해 프롬프트가 실행된다. exit handler와의 중복을 방지하기 위해 리포트 상태를 활용한다:

- `'pending'` → 수집만 된 상태, 프롬프트 안 됨 → exit handler가 프롬프트 대상으로 인식
- `'prompted'` → 프롬프트가 표시되었으나 사용자가 제출하지 않음 (cancel, save, view 등) → exit handler가 무시
- `'submitted'` → 제출 완료 → exit handler가 무시

기존 `status` 타입에 `'prompted'`를 추가한다. `promptAndSubmit`은 프롬프트 시작 시 리포트 상태를 `'prompted'`로 업데이트하고, 제출 성공 시 `'submitted'`로 전환한다. exit handler는 `'pending'` 상태의 리포트만 대상으로 한다.

**중복 리포트 방지**:

동일 에러가 `reportError`와 `wrapCommand` 양쪽에서 수집될 수 있는 상황(예: catch 블록에서 `reportError` 호출 후 에러를 re-throw하여 `wrapCommand`의 catch에 도달)을 방지하기 위해, `reportError`는 수집된 에러를 추적한다:

- **객체 에러**: `WeakSet`으로 추적. 이미 수집된 에러 인스턴스에 대해 재호출 시 기존 리포트를 반환하고 중복 저장하지 않는다.
- **원시값 에러** (string, number 등): `WeakSet`에 저장할 수 없으므로 중복 방지가 적용되지 않는다. 원시값 에러는 실무에서 드물고, 중복 발생 시 store에 2건이 저장될 수 있으나 기능적 문제는 없다.

### 6. Exit Handler

프로세스 종료 직전에 미제출 리포트가 있으면 프롬프트를 띄우는 safety net.

**beforeExit** (기본 활성화):
- `process.exitCode = N` 패턴에서 동작
- async 코드 실행 가능
- `process.exit()` 직접 호출 시에는 발동하지 않음

**process.exit 몽키패치** (옵트인: `interceptProcessExit: true`):
- 원본 `process.exit` 저장 후 래핑
- 패치된 `process.exit(code)`가 호출되면:
  1. exit code를 저장
  2. 미제출(`'pending'`) 리포트가 없으면 → 즉시 원본 `process.exit` 호출
  3. 미제출 리포트가 있으면 → 원본 exit를 호출하지 않고 리턴 (호출자에게 제어 반환)
  4. `setImmediate`로 async 프롬프트를 스케줄링
  5. 프롬프트 완료 후 원본 `process.exit(savedCode)` 호출

**알려진 트레이드오프**: `process.exit()` 호출 후 코드가 잠시 계속 실행될 수 있다. 이는 Node.js의 `process.exit`이 동기적으로 즉시 종료하는 계약을 위반하지만, 미제출 에러 리포트를 살리기 위한 의도적 선택이다. 이 때문에 옵트인으로 제공하며, 기본 접근은 `beforeExit`를 권장한다.

```ts
installExitHandler()                                    // beforeExit만
installExitHandler({ interceptProcessExit: true })      // process.exit 패치 포함
```

## Test Scenarios

### 1. Runtime 버전 감지

| # | 시나리오 | 입력 | 기대값 |
|---|---------|------|--------|
| 1.1 | Node.js 환경 | `typeof Bun === 'undefined'`, `process.version = 'v22.0.0'` | `runtimeVersion: 'v22.0.0'` |
| 1.2 | Bun 환경 | `typeof Bun !== 'undefined'`, `Bun.version = '1.1.0'` | `runtimeVersion: '1.1.0'` |
| 1.3 | 포맷 출력 (Node) | runtime='node', version='v22.0.0' | `\| Runtime \| node v22.0.0 \|` |
| 1.4 | 포맷 출력 (Bun) | runtime='bun', version='1.1.0' | `\| Runtime \| bun 1.1.0 \|` |

### 2. Presenter Adapter

| # | 시나리오 | 기대 동작 |
|---|---------|----------|
| 2.1 | Custom presenter 제공 | custom presenter의 `prompt()` 호출됨, built-in 사용 안 함 |
| 2.2 | Custom presenter가 `null` 반환 | 프롬프트 스킵, 에러 수집만 |
| 2.3 | Custom presenter가 `{ type: 'gh' }` 반환 | SDK가 gh로 publish 실행 |
| 2.4 | Custom presenter가 `{ type: 'cancel' }` 반환 | publish 실행 안 함 |
| 2.5 | Presenter 미제공 + CLI preset | built-in TerminalPresenter 사용 |
| 2.6 | Presenter 미제공 + SDK preset | 프롬프트 스킵 |

### 3. Built-in Terminal Presenter Fallback

| # | 시나리오 | 기대 동작 |
|---|---------|----------|
| 3.1 | stdout.write 원본 상태 | 일반 프롬프트 출력 |
| 3.2 | stdout.write 패치된 상태 | 커서 최하단 이동 + 원본 write로 출력 |
| 3.3 | non-TTY 환경 | `null` 반환 (프롬프트 스킵) |
| 3.4 | Import 시점 원본 저장 검증 | 원본 참조가 모듈 로드 시점에 캡처됨 |

### 4. Preset 시스템

| # | 시나리오 | 기대 동작 |
|---|---------|----------|
| 4.1 | `preset: 'cli'` | argv 수집, command 섹션 포함, TerminalPresenter, interactive='auto' |
| 4.2 | `preset: 'sdk'` | argv 수집 안 함, command 섹션 제외, presenter=null, interactive='never' |
| 4.3 | preset 미지정 | 'cli' 기본값 적용 (하위 호환) |
| 4.4 | preset + 개별 오버라이드 | `preset: 'sdk', presenter: customPresenter` → SDK 기본값에 presenter만 오버라이드 |
| 4.5 | CLI preset + formatTitle | `[command] Error: msg` 형태 |
| 4.6 | SDK preset + formatTitle | `Error: msg` 형태 (command prefix 없음) |
| 4.7 | SDK preset에서 wrapCommand 호출 | 동작하지만 argv가 빈 상태로 수집 (에러 안 던짐) |

### 5. 전역 Reporter 레지스트리

| # | 시나리오 | 기대 동작 |
|---|---------|----------|
| 5.1 | 단일 reporter | 레지스트리에 등록, parent 없음, 정상 동작 |
| 5.2 | 부모-자식 reporter (absorb) | 자식 에러 → 부모의 `receiveChildReport` 호출 |
| 5.3 | 부모-자식 reporter (passthrough) | 자식이 자체 presenter로 프롬프트 |
| 5.4 | 부모-자식 reporter (silent) | 자식은 store 저장만, 프롬프트 없음 |
| 5.5 | 3단 중첩 (A → B → C) | C의 에러가 B를 거쳐 A까지 전파 (absorb 체인) |
| 5.6 | Reporter 해제 시 레지스트리 정리 | 등록 해제 후 parent 조회 시 null |
| 5.7 | cross-package Symbol.for 공유 | 다른 패키지에서 생성한 reporter도 같은 레지스트리에 등록됨 |

### 6. 새 API 메서드

#### 6.1 `reportAndPrompt(error, context?)`

| # | 시나리오 | 기대 동작 |
|---|---------|----------|
| 6.1.1 | 기본 호출 | `reportError` + `promptAndSubmit` 순차 실행 |
| 6.1.2 | presenter가 null | 수집만, 프롬프트 스킵 |
| 6.1.3 | 에러 수집 실패 | 예외 안 던짐, fallback report로 진행 |
| 6.1.4 | 상위 reporter 존재 (absorb) | 자식에서 수집 후 상위로 전달, 자식은 프롬프트 안 함 |

#### 6.2 `wrap(fn, opts?)`

| # | 시나리오 | 기대 동작 |
|---|---------|----------|
| 6.2.1 | fn 성공 | 정상 완료, 에러 보고 없음 |
| 6.2.2 | fn 실패, rethrow=true (기본) | `reportAndPrompt` 실행 후 에러 re-throw |
| 6.2.3 | fn 실패, rethrow=false | `reportAndPrompt` 실행, 에러 삼킴 |
| 6.2.4 | process.argv 컨텍스트 | 수집 안 함 (wrapCommand와 차이) |

#### 6.5 `wrapCommand(fn, opts?)` 변경사항

| # | 시나리오 | 기대 동작 |
|---|---------|----------|
| 6.5.1 | wrapCommand + rethrow=true (기본) | 기존 동작과 동일, process.argv 수집 + re-throw |
| 6.5.2 | wrapCommand + rethrow=false | process.argv 수집, 프롬프트 후 에러 삼킴 |
| 6.5.3 | wrapCommand가 수집하는 argv 확인 | command=process.argv[2], subcommand=process.argv[3] |

#### 6.3 `installExitHandler(opts?)`

| # | 시나리오 | 기대 동작 |
|---|---------|----------|
| 6.3.1 | 미제출 리포트 있음 + beforeExit | 프롬프트 실행 |
| 6.3.2 | 미제출 리포트 없음 + beforeExit | 아무 동작 안 함 |
| 6.3.3 | process.exit(1) + interceptProcessExit=false | 프롬프트 없이 즉시 종료 |
| 6.3.4 | process.exit(1) + interceptProcessExit=true | 프롬프트 실행 후 원본 exit 호출 |
| 6.3.5 | cleanup 함수 호출 | 리스너 해제, 원본 process.exit 복원 |

#### 6.4 `receiveChildReport(report)`

| # | 시나리오 | 기대 동작 |
|---|---------|----------|
| 6.4.1 | 자식 리포트 수신 | 자신의 presenter로 프롬프트 |
| 6.4.2 | 자식 리포트의 app 정보 보존 | 원본 앱 이름/버전 유지 |
| 6.4.3 | presenter가 null | store에 저장만 |

### 7. 통합 시나리오 (End-to-End)

| # | 시나리오 | 기대 동작 |
|---|---------|----------|
| 7.1 | pubm 패턴: catch 내 `reportAndPrompt` | 에러 수집 + 프롬프트 + exitCode 설정 |
| 7.2 | CLI 앱 + SDK 라이브러리 중첩 (absorb) | SDK 에러 → CLI reporter가 프롬프트 |
| 7.3 | CLI 앱 + SDK 라이브러리 중첩 (passthrough) | SDK가 자체 프롬프트 (built-in fallback) |
| 7.4 | TUI 앱 + custom presenter | TUI 프레임워크 API로 프롬프트 렌더링 |
| 7.5 | `reportError`만 호출 + exit handler | 종료 시 미제출 리포트 감지 → 프롬프트 |
| 7.6 | `wrapCommand` + 내부 catch에서 `reportError` | 중복 리포트 방지 (같은 에러 2번 수집 안 됨) |
| 7.7 | SDK preset + 상위 CLI reporter 없음 | 수집만, 프롬프트 없음 (SDK 기본 동작) |

### 8. 엣지 케이스

| # | 시나리오 | 기대 동작 |
|---|---------|----------|
| 8.1 | `reportError(null)` | 예외 안 던짐, fallback report 반환 |
| 8.2 | `reportError(undefined)` | 예외 안 던짐, fallback report 반환 |
| 8.3 | `reportError('string error')` | 문자열을 Error.message로 캡처 |
| 8.4 | presenter.prompt()에서 예외 발생 | 예외 삼키고 수집만 완료 |
| 8.5 | 레지스트리에 부모 등록 후 부모 해제, 자식 에러 발생 | parent=null, 자식이 직접 처리 |
| 8.6 | 동시에 여러 에러 발생 | 각각 독립적으로 수집, 프롬프트는 내부 큐로 직렬화 (동시에 2개의 프롬프트가 stdin을 읽지 않도록) |
| 8.7 | exit handler 중 프롬프트에서 사용자가 응답 안 함 (timeout) | 기본 30초 타임아웃 후 종료 진행 (`ExitHandlerOptions.timeout`으로 설정 가능) |
| 8.8 | 프롬프트 중 SIGTERM 수신으로 프롬프트 중단 | 리포트가 `'prompted'` 상태로 남음. 알려진 제한: exit handler가 해당 리포트를 재프롬프트하지 않음. 다음 실행 시 `cluvo list`로 확인 가능 |

## Documentation Updates

### README.md 업데이트

현재 README는 CLI 중심 사용법만 포함. 다음 항목 추가/수정:

1. **Getting Started 섹션 분리**
   - CLI 앱 통합 가이드 (preset: 'cli')
   - SDK/라이브러리 통합 가이드 (preset: 'sdk')
   - TUI 앱 통합 가이드 (custom presenter)

2. **API 레퍼런스 업데이트**
   - 새 메서드: `reportAndPrompt`, `wrap`, `installExitHandler`, `receiveChildReport`
   - Presenter Adapter 인터페이스 설명
   - WrapOptions, ExitHandlerOptions 문서화

3. **Preset 설명 추가**
   - CLI vs SDK preset 차이점 표
   - 오버라이드 방법

4. **중첩 사용 가이드**
   - 전역 레지스트리 개념 설명
   - childPolicy 옵션별 동작
   - 다계층 예제

5. **Configuration 섹션 업데이트**
   - `preset` 옵션 추가
   - `presenter` 옵션 추가
   - `childPolicy` 옵션 추가
   - `installExitHandler` 옵션 추가

### ARCHITECTURE.md 업데이트

1. **Presenter System 섹션 수정**
   - Adapter 패턴 도입 설명
   - Built-in Terminal Presenter + TUI fallback 전략

2. **SDK Package Architecture 섹션 수정**
   - Preset 시스템
   - 전역 Reporter 레지스트리
   - 새 API 메서드 관계도

3. **Integration Patterns 섹션 수정**
   - CLI 통합 패턴
   - SDK 통합 패턴
   - TUI 통합 패턴
   - 중첩 통합 패턴

### 기존 문서 정합성

- CLAUDE.md — 파이프라인 설명에 presenter adapter 언급 추가
- CONTRIBUTING.md — 테스트 관련 섹션에 새 테스트 패턴 반영
