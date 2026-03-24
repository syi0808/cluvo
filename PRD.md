# Cluvo 통합 제품 명세서

## 문서 정보

* 제품명: **Cluvo**
* 문서 버전: v0.1
* 문서 목적: Cluvo의 **타겟 사용자, 페르소나, 제품 기획, PRD**를 하나의 기준 문서로 통합하여 향후 제품 설계, MVP 범위 정의, 엔지니어링 구현 논의의 기준점으로 사용한다.

---

## 1. 제품 개요

### 1.1 제품 한 줄 정의

Cluvo는 오픈소스 CLI/SDK에 내장할 수 있는 **local-first, zero-backend bug reporting SDK**로, 사용자 환경에서 발생한 에러를 로컬에서 수집·정리·마스킹한 뒤 **GitHub Issue 초안**으로 전환해주는 도구다.

### 1.2 제품이 아닌 것

Cluvo는 다음을 목표로 하지 않는다.

* 서버 기반 에러 수집 플랫폼
* 대시보드형 observability / APM
* 실시간 alerting 시스템
* crash analytics SaaS
* Sentry 대체용 full monitoring stack

즉, Cluvo는 **에러를 수집·집계하는 서버형 트래커**가 아니라, **서버 없이 고품질 버그 리포트를 만들어주는 reporter SDK**다.

### 1.3 핵심 가치

* **Maintainer에게**: 재현 가능한 버그 리포트를 더 많이 받게 해준다.
* **Reporter에게**: 민감정보를 보호하면서 손쉽게 이슈를 제출하게 해준다.
* **오픈소스 프로젝트에게**: 버그 리포트 품질을 표준화하고 triage 비용을 줄여준다.

---

## 2. 문제 정의

오픈소스 CLI/SDK 유지보수자는 아래 문제를 반복적으로 겪는다.

* 사용자가 “안 된다” 수준으로만 이슈를 올린다.
* 에러 메시지, stack trace, 실행 환경, 재현 단계가 빠져 있다.
* 유지보수자가 추가 질문을 여러 번 해야 한다.
* 사용자 로컬 환경 차이로 인해 재현이 어렵다.
* Sentry 같은 서버형 도구는 작은 오픈소스 프로젝트에는 과하다.
* 자동 업로드는 민감정보와 프라이버시 우려 때문에 부담스럽다.

결국 버그 수정 자체보다 **불완전한 이슈를 보완하는 커뮤니케이션 비용**이 더 커지는 문제가 생긴다.

Cluvo는 이 문제를 다음 방식으로 해결한다.

1. 에러가 발생하면 로컬에서 필요한 정보를 수집한다.
2. 민감정보를 기본적으로 마스킹한다.
3. 사용자가 최종 내용을 검토한다.
4. GitHub Issue 초안 형태로 제출을 돕는다.

---

## 3. 제품 비전

### 3.1 비전

모든 오픈소스 CLI/SDK가 서버 없이도 **디버깅 가능한 수준의 버그 리포트 UX**를 기본 제공하도록 만든다.

### 3.2 제품 포지셔닝

Cluvo는 다음 포지션을 가진다.

* **Local-first**
* **Privacy-safe by default**
* **Maintainer-centric output**
* **Zero-backend**
* **GitHub issue workflow optimized**

### 3.3 핵심 철학

* 모든 데이터 처리는 기본적으로 로컬에서 끝난다.
* 자동 전송이 아니라 사용자 검토 후 제출한다.
* 보기 좋은 리포트보다 실제 디버깅 가능한 리포트를 우선한다.
* 도입 비용은 매우 낮아야 한다.

---

## 4. 타겟층

### 4.1 1차 타겟

#### A. 오픈소스 CLI Maintainer

예시:

* 개발 도구 CLI
* 빌드/배포 CLI
* AI agent CLI
* 패키지 관리 보조 도구
* 인프라/DevTools CLI

특징:

* GitHub 중심으로 프로젝트를 운영한다.
* 사용자 로컬 환경에서 실행되는 도구를 만든다.
* 환경 차이 때문에 버그 재현이 어렵다.
* Sentry 같은 서버형 스택은 부담스럽게 느낀다.
* Issue template만으로는 충분하지 않다고 느낀다.

#### B. SDK / 라이브러리 Maintainer

예시:

* Node SDK
* API client SDK
* 플러그인 SDK
* CLI용 라이브러리

특징:

* 사용자 측 에러 상황을 구조적으로 수집하기 어렵다.
* 콘솔 로그 일부만 공유받아 재현이 어려운 경우가 많다.
* CLI보다는 다소 간접적이지만, structured bug reporting 니즈가 크다.

### 4.2 2차 타겟

#### C. 사내 개발자 도구 팀 / DX 팀

예시:

* 사내 배포용 CLI
* 사내 SDK
* 팀 공용 DX 툴

확장 니즈:

* GitHub Enterprise
* GitLab Issue
* Jira 연동

초기 핵심 타겟은 아니지만, 추후 확장 가능성이 있다.

### 4.3 비타겟층

초기에는 아래는 명확히 제외한다.

* 모바일 crash analytics
* 웹 프론트엔드 monitoring
* 서버단 observability
* 실시간 에러 집계/통계/대시보드가 필요한 팀
* 기업용 자동 수집/업로드 중심 솔루션을 원하는 팀

---

## 5. 사용자 구조와 관계도

Cluvo는 단순 1인 사용자 제품이 아니라, **3자 관계 구조**를 갖는다.

### 5.1 핵심 사용자 역할

1. **Integrator**

   * Cluvo를 자신의 CLI/SDK에 붙이는 사람
   * 보통 OSS Maintainer 또는 Core Contributor

2. **Reporter**

   * 실제 에러를 겪고 이슈를 제출하는 사용자
   * 보통 CLI/SDK의 End User

3. **Maintainer / Triage Owner**

   * 들어온 이슈를 보고 분류·재현·해결하는 사람
   * Integrator와 동일 인물일 수도 있고 별도 팀원일 수도 있다

### 5.2 사용자 관계 구조

```text
[Cluvo SDK]
   │
   ▼
[Integrator / OSS Maintainer]
   - SDK 내장
   - sanitize 정책 설정
   - GitHub issue form 연동
   │
   ▼
[Reporter / End User]
   - 에러 발생
   - 로컬 수집 / 마스킹 / 미리보기
   - issue 제출
   │
   ▼
[Maintainer / Triage Owner]
   - 구조화된 이슈 수신
   - triage / 재현 / 수정
```

### 5.3 관계를 단계별로 보면

* **도입 관계**: Cluvo ↔ Integrator
* **실행 관계**: Integrator의 제품 ↔ Reporter
* **운영 관계**: Reporter ↔ Maintainer

즉, Cluvo의 직접 고객은 Integrator이고, 실제 UX 사용자는 Reporter이며, 최종 가치 수혜자는 Maintainer다.

---

## 6. 페르소나

### Persona A — Solo OSS Maintainer

#### 기본 정보

* 혼자 또는 소규모로 CLI 오픈소스를 유지보수한다.
* GitHub Issues로 대부분의 지원/버그 보고를 처리한다.
* 업무 외 시간에 유지보수하는 경우가 많다.

#### 목표

* 재현 가능한 버그 리포트를 더 많이 받고 싶다.
* 왕복 커뮤니케이션 비용을 줄이고 싶다.
* 가볍고 빠르게 도입 가능한 도구를 원한다.

#### 고충

* 사용자가 버전, OS, 실행 커맨드를 잘 적지 않는다.
* “에러나요” 수준의 이슈가 많다.
* 서버 운영은 귀찮고 부담스럽다.

#### 기대

* 5~10분 이내 도입 가능
* GitHub 이슈 흐름과 자연스럽게 연결
* 기본 민감정보 마스킹 제공
* 사용자가 내용을 확인한 뒤 제출 가능

---

### Persona B — CLI End User

#### 기본 정보

* CLI를 사용하는 일반 개발자 또는 파워유저다.
* 프로젝트 maintainer는 아니다.
* 에러가 나도 어떤 정보를 보내야 하는지 잘 모른다.

#### 목표

* 문제를 빠르게 보고하고 해결받고 싶다.
* issue 작성에 시간을 많이 쓰고 싶지 않다.

#### 고충

* 로그가 너무 길고 복잡하다.
* 민감한 정보가 들어갈까 걱정된다.
* GitHub issue 양식이 번거롭다.

#### 기대

* 자동으로 초안이 생성될 것
* 제출 전 어떤 정보가 올라가는지 볼 수 있을 것
* 토큰, 홈 디렉터리, 환경변수 등이 자동 마스킹될 것

---

### Persona C — Team Maintainer / DX Engineer

#### 기본 정보

* 회사나 팀에서 여러 CLI/SDK를 운영한다.
* 지원 효율과 triage 품질을 중요하게 생각한다.

#### 목표

* 버그 리포트 품질을 통일하고 싶다.
* 여러 프로젝트에 재사용 가능한 공통 reporter를 원한다.
* support 비용을 줄이고 싶다.

#### 고충

* 프로젝트마다 버그 리포트 포맷이 다르다.
* 반복적으로 환경 정보를 다시 물어봐야 한다.

#### 기대

* 설정 가능한 수집 필드
* 공통 sanitizer 규칙
* GitHub form / gh CLI / custom output 확장성

---

## 7. JTBD (Jobs To Be Done)

### Integrator 관점

“내 오픈소스 CLI에 가벼운 버그 리포팅 흐름을 붙여서, 사용자들이 더 좋은 품질의 issue를 쉽게 올리게 하고 싶다.”

### Reporter 관점

“에러가 났을 때 무엇을 적어야 할지 고민하지 않고, 민감정보는 숨긴 채 issue를 쉽게 제출하고 싶다.”

### Maintainer 관점

“들어온 버그 리포트만 보고도 추가 질문 없이 문제 원인을 빠르게 파악하고 싶다.”

---

## 8. 제품 목표와 비목표

### 8.1 목표

1. 유지보수자가 **고품질 버그 리포트**를 더 쉽게 받게 한다.
2. 사용자가 **쉽고 안전하게** 버그를 제보하게 한다.
3. **백엔드 없이도** 재현 가능한 수준의 issue를 만들게 한다.
4. 오픈소스 프로젝트의 버그 리포트 UX를 표준화한다.

### 8.2 성공 기준

* issue당 maintainer의 추가 질문 횟수 감소
* 재현 가능한 이슈 비율 증가
* 도입 프로젝트 수 증가
* 사용자의 issue 제출 완료율 증가

### 8.3 비목표

* 서버 기반 이벤트 수집/집계
* 실시간 알림
* 에러 대시보드
* 이벤트 dedupe 서버
* 조직용 분석 리포트
* full-stack monitoring

---

## 9. 핵심 사용자 시나리오

### 시나리오 A — CLI 실행 중 예상치 못한 예외 발생

1. 사용자가 CLI를 실행한다.
2. 예외가 발생한다.
3. Cluvo가 에러/환경/커맨드 정보를 수집한다.
4. 민감정보를 마스킹한다.
5. 사용자에게 미리보기를 보여준다.
6. 사용자가 “GitHub Issue 만들기”를 선택한다.
7. 브라우저 또는 `gh issue create`로 issue 초안이 생성된다.
8. 사용자가 최종 제출한다.

### 시나리오 B — Integrator가 명시적으로 에러 리포트 호출

1. SDK 사용자 코드에서 `reportError(error, context)`를 호출한다.
2. Cluvo가 structured report를 만든다.
3. 사용자에게 preview 또는 저장 옵션을 제공한다.
4. GitHub issue 초안 또는 markdown 파일이 생성된다.

### 시나리오 C — 민감정보 우려가 있는 사용자

1. 사용자에게 수집 항목과 마스킹된 결과를 보여준다.
2. 사용자는 일부 섹션을 제외하거나 취소할 수 있다.
3. 확인 후 제출한다.

### 시나리오 D — 네트워크/gh 사용이 어려운 환경

1. issue 생성이 실패한다.
2. Cluvo는 markdown 파일 저장 또는 터미널 preview를 fallback으로 제공한다.
3. 사용자는 수동으로 나중에 issue를 올릴 수 있다.

---

## 10. MVP 범위

### 10.1 초기 지원 범위

* Node.js CLI
* GitHub Issues
* macOS / Linux / Windows
* 브라우저 issue prefill
* `gh issue create`
* markdown file export

### 10.2 초기 수집 범위

* 에러 message
* stack trace
* error name
* cause chain
* app version
* runtime version
* OS / architecture
* command / subcommand
* sanitized argv
* optional envinfo output
* optional diagnostic report summary

### 10.3 제외 범위

* 자동 silent submit
* 서버 전송
* 브라우저 웹앱 UI
* 조직용 분석 대시보드
* 멀티 issue tracker 지원

---

## 11. PRD — 요구사항 명세

### 11.1 문서 목적

이 섹션은 Cluvo의 MVP 및 초기 확장 범위를 엔지니어링 구현 가능한 수준으로 정의한다.

### 11.2 제품 한 줄 설명

Cluvo는 오픈소스 CLI/SDK에서 발생한 오류를 로컬에서 수집·정리·마스킹하고, 사용자가 검토 가능한 형태의 **구조화된 GitHub 이슈 초안**으로 전환해주는 SDK다.

---

## 12. 기능 요구사항 (Functional Requirements)

### FR-1. 에러 캡처

Cluvo는 다음 유형의 에러를 수집할 수 있어야 한다.

* uncaught exception
* unhandled rejection
* integrator가 명시적으로 전달한 exception
* command execution failure
* wrapped/internal error

#### 세부 요구사항

* error name, message, stack, cause를 추출한다.
* stack이 없을 경우 fallback 설명을 생성한다.
* nested cause chain을 요약 가능해야 한다.

---

### FR-2. 실행 환경 수집

Cluvo는 디버깅에 필요한 실행 환경 정보를 수집해야 한다.

#### 필수 항목

* app name
* app version
* runtime type
* runtime version
* OS
* architecture
* current command
* current subcommand
* execution timestamp
* optional release id / git sha

#### 선택 항목

* envinfo 결과
* installed plugin list
* config summary
* feature flags
* package manager info

#### 제약

* 기본은 최소 수집
* Integrator가 opt-in으로 확장 필드를 활성화할 수 있어야 함

---

### FR-3. 민감정보 마스킹

Cluvo는 이슈 생성 전에 민감정보를 자동 마스킹해야 한다.

#### 기본 마스킹 대상

* access token
* api key
* bearer token
* secret
* password
* email 일부
* home directory 절대경로
* user name 포함 경로
* known auth headers
* full environment variables

#### 요구사항

* 기본 sanitizer 내장
* custom sanitizer rule 추가 가능
* preview 단계에서 마스킹 결과 확인 가능
* raw payload를 자동 전송/저장하지 않음

---

### FR-4. 사용자 검토 단계

Cluvo는 issue 생성 전에 사용자가 내용을 검토할 수 있어야 한다.

#### 요구사항

* title preview 제공
* body preview 제공
* 수집된 필드 목록 표시
* 마스킹 여부 표시
* 사용자가 제출 취소 가능
* 사용자가 일부 섹션 제외 가능

#### UX 원칙

* 기본은 “확인 후 제출”
* silent auto-submit은 지원하지 않음

---

### FR-5. GitHub issue 초안 생성

Cluvo는 GitHub issue 초안을 생성할 수 있어야 한다.

#### 방식 A: 브라우저 prefill

* repo owner/name 지정 가능
* issue title 전달
* issue body 전달
* issue form field mapping 지원 가능

#### 방식 B: `gh issue create`

* `gh` 설치 여부 감지
* 인증 여부 확인
* title/body 기반 issue 생성
* 실패 시 브라우저 fallback 가능

---

### FR-6. 이슈 템플릿 구조화

Cluvo는 Maintainer 친화적인 issue body를 만들 수 있어야 한다.

#### 기본 섹션

* Summary
* Steps to Reproduce
* Expected Behavior
* Actual Behavior
* Environment
* Command
* Stack Trace
* Additional Context

#### 요구사항

* 섹션 순서 설정 가능
* 섹션 on/off 가능
* custom markdown section 추가 가능

---

### FR-7. Integrator 설정 API

Integrator는 SDK 동작을 설정할 수 있어야 한다.

#### 설정 가능 항목

* target GitHub repository
* issue template type
* default labels
* sanitizer rules
* collected fields
* issue title formatter
* issue body formatter
* reporter mode
* browser / gh 우선순위

#### 예시 API

* `createReporter(config)`
* `reportError(error, context)`
* `wrapCommand(fn)`
* `buildIssueDraft(payload)`

---

### FR-8. 로컬 파일 출력

Cluvo는 issue 초안을 로컬 파일로 저장할 수 있어야 한다.

#### 요구사항

* markdown 파일 출력
* json debug payload 출력
* temp file 또는 custom path 지원
* 저장만 하고 자동 제출하지 않는 모드 지원

---

### FR-9. Node 진단 리포트 연동

Node.js CLI 환경에서 diagnostic report 연동이 가능해야 한다.

#### MVP 요구사항

* 전체 첨부보다 요약 우선
* 고급 설정으로 report path 참조 가능
* 과도한 payload 방지

---

### FR-10. 실패 복구

Issue 생성 과정이 실패해도 사용자가 내용을 잃지 않아야 한다.

#### 요구사항

* 브라우저 open 실패 시 markdown 출력
* `gh` 실패 시 브라우저 fallback
* 양쪽 모두 실패 시 terminal preview + file save
* payload 유실 금지

---

## 13. 비기능 요구사항 (Non-Functional Requirements)

### NFR-1. Zero Backend

* 자체 서버 없이 완전히 동작해야 한다.
* SDK vendor server를 전제로 하지 않는다.

### NFR-2. Privacy by Default

* 기본적으로 과도한 정보 수집 금지
* 사용자 검토 가능
* raw secrets 자동 전송 금지

### NFR-3. Low Adoption Cost

* 도입은 10분 이내가 목표
* 최소 설정으로 동작해야 한다.
* Hello World integration이 쉬워야 한다.

### NFR-4. Local-first Reliability

* 네트워크 없이도 draft 생성 가능
* GitHub 실패 시 로컬 출력 가능

### NFR-5. Readable Output

* 사람이 읽기 쉬운 issue body
* triage 가능한 구조

### NFR-6. Extensibility

* 향후 GitLab/Jira adapter 확장 가능
* 다른 runtime으로 확장 가능

---

## 14. UX 요구사항

### 14.1 UX 원칙

* 사용자를 놀라게 하지 않는다.
* 수집 정보를 숨기지 않는다.
* 터미널 환경에서 과도하게 장황하지 않다.
* preview는 충분히 자세하지만 제출 흐름은 짧아야 한다.

### 14.2 CLI UX 예시

```bash
An unexpected error occurred.

Cluvo can help create a bug report with:
- sanitized stack trace
- environment summary
- command context

Review report before sending? (Y/n)
```

이후 사용자에게 선택지를 제공한다.

* Open GitHub issue in browser
* Create via gh
* Save markdown locally
* Cancel

---

## 15. 데이터 모델 초안

### ErrorReport

* id
* createdAt
* appName
* appVersion
* runtime
* environment
* commandContext
* error
* sanitizedFields
* metadata
* draft

### ErrorPayload

* name
* message
* stack
* causeChain
* category
* severity

### EnvironmentPayload

* os
* arch
* runtimeVersion
* packageManager
* shell
* ci
* pluginVersions

### DraftPayload

* title
* body
* labels
* templateId
* outputMode

---

## 16. API 초안

```ts
type ReporterConfig = {
  repo: string
  mode?: 'browser' | 'gh' | 'manual'
  collect?: {
    envinfo?: boolean
    diagnosticReport?: boolean
    argv?: boolean
    configSummary?: boolean
  }
  sanitize?: {
    enabled?: boolean
    customRules?: SanitizeRule[]
  }
  issue?: {
    template?: string
    labels?: string[]
    title?: (ctx: IssueTitleContext) => string
  }
}
```

```ts
const reporter = createReporter(config)

await reporter.reportError(error, {
  command: 'cluvo demo',
  argv: process.argv,
  context: { mode: 'release' }
})
```

보조 API 예시:

* `buildReport(error, context)`
* `previewReport(report)`
* `openIssue(report)`
* `saveReport(report, path)`
* `sanitizeReport(report)`

---

## 17. 성공 지표

### 제품 지표

* SDK 설치 수
* GitHub stars
* weekly active repos using Cluvo

### 사용자 효율 지표

* 추가 질문 필요 비율 감소
* issue reproducibility 개선
* issue template 완성도 증가

### UX 지표

* report flow completion rate
* cancel rate
* browser vs gh usage ratio
* manual edit rate

초기에는 서버가 없기 때문에 정량 측정이 제한적이다. 따라서 초기에는 **Maintainer 인터뷰 및 도입 사례 기반의 정성 검증**이 중요하다.

---

## 18. 출시 로드맵

### v0.1

* Node.js CLI 지원
* 브라우저 issue prefill
* `gh issue create`
* 기본 sanitizer
* markdown template
* local file export

### v0.2

* issue form field mapping
* richer custom sections
* better argv/config sanitization
* plugin metadata support

### v0.3

* Node SDK non-CLI support
* GitLab issue adapter
* JSON payload export schema stabilization

---

## 19. 리스크

### 19.1 민감정보 마스킹 누락

완벽한 sanitize는 어렵다.

대응:

* preview 필수
* conservative default
* custom sanitizer 지원

### 19.2 issue body 과도한 길이

정보가 많아질수록 가독성이 떨어진다.

대응:

* summary 우선
* 긴 내용은 file export fallback

### 19.3 GitHub URL 길이 한계

브라우저 prefill 방식은 길이 제한에 걸릴 수 있다.

대응:

* 긴 payload는 `gh` 우선
* markdown 저장 fallback 제공

### 19.4 사용자 이탈

preview 단계가 길면 제출 포기 가능성이 있다.

대응:

* simple default
* verbose mode 분리

### 19.5 범용성 과욕

처음부터 모든 언어/플랫폼을 잡으려 하면 제품이 흐려진다.

대응:

* Node CLI first

---

## 20. 오픈 질문

1. 제품 포지셔닝은 “error reporter”와 “bug reporter” 중 무엇이 더 적절한가?
2. GitHub issue form prefill 지원 범위를 MVP에서 어디까지 둘 것인가?
3. diagnostic report는 요약까지만 제공할지, 파일 첨부 흐름까지 제공할지?
4. `gh` 의존 흐름을 얼마나 공식 지원할 것인가?
5. SDK 환경에서는 어떤 UX 트리거가 가장 적절한가?
6. 사용자에게 inline 편집 UX가 필요한가?

---

## 21. 핵심 의사결정 요약

* 제품명은 **Cluvo**로 한다.
* 초기 핵심 타겟은 **GitHub 기반 OSS CLI Maintainer**다.
* 제품 형태는 **Node.js용 local-first reporter SDK**다.
* 핵심 차별점은 **zero-backend, privacy-safe, maintainer-centric**다.
* 핵심 UX는 **local collect → sanitize → preview → GitHub issue draft**다.
* MVP는 **Node CLI + GitHub Issues + browser/gh/manual fallback** 조합으로 정의한다.

---

## 22. MVP 한 문장 정의

**Cluvo는 오픈소스 CLI에서 에러가 났을 때, 사용자가 검토 가능한 구조화된 GitHub issue 초안을 서버 없이 생성해주는 SDK다.**
