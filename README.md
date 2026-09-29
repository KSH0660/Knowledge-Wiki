# Knowledge Wiki

사내 엔지니어를 위한 가벼운 지식 거버넌스 플랫폼. 사람은 Web UI로 문서를 읽고 변경을 제안하며, AI는 MCP로 같은 지식을 검색합니다. 공개된 문서와 폴더 정책의 원본은 원격 Git 저장소에 있습니다. 일반 사용자 화면에서 Git 작업은 필요하지 않습니다.

## 실행

Node.js **24 이상**, Git이 필요합니다.

```sh
npm ci
npm run dev
```

**http://127.0.0.1:5173** 에서 시작합니다. 별도 설정 없이 `.data/`에 SQLite, checkout, 로컬 bare remote를 생성하고 예시 문서와 검토 요청을 넣습니다. 우측 상단 프로필에서 데모 사용자(Sunho/Alex/Yuna/Min)를 전환해 요청자·Owner의 흐름을 확인할 수 있습니다. 데모는 loopback에서만 실행됩니다. 예시 기술 사양의 수치는 제품 동작 설명용입니다.

배포용 정적 파일은 같은 Node 서버에서 제공합니다.

```sh
npm run build
npm start
# http://127.0.0.1:3001
```

`.env.example`을 `.env`로 복사하면 실행 스크립트가 자동으로 읽습니다. 런타임에는 외부 CDN, 폰트, AI API를 호출하지 않습니다. 폐쇄망 반입 전에 잠금 파일 기준으로 의존성이나 Docker 이미지를 준비하세요.

## 구성

```text
React + Vite Web UI ─┐
                    ├─ Node / Express ─ SQLite (CR·리뷰·설정·FTS5)
MCP Streamable HTTP ┘         └──────── Remote Git (문서·폴더 정책·이력)
```

- `src/`: Home, Knowledge, Document, Create Change, CR Detail, My Reviews, Folder Governance, Personal AI Settings.
- `server/service.ts`: Web/MCP가 공유하는 책임·승인·프롬프트 규칙.
- `server/repository.ts`: 단일 checkout, 원격 동기화, 충돌 감지, 발행 및 이력.
- `server/store.ts`: SQLite WAL과 검색 색인. 검색은 별도 서버 없이 수행합니다.
- `shared/types.ts`: 도메인 타입. 상세 설계는 [architecture.md](docs/architecture.md).

### 책임과 변경 흐름

폴더는 임의로 중첩할 수 있습니다. 가장 가까운 명시적 Owner가 하위 영역을 담당합니다. 승인 정책도 상속되며 **Local**은 해당 Owner, **Cascade**는 경로에 명시된 모든 서로 다른 Owner의 승인이 필요합니다. 최상위 폴더에는 항상 Owner와 정책이 있어야 합니다. 자신의 담당 영역 또는 운영 admin만 거버넌스를 수정할 수 있습니다.

누구나 폴더를 만들 수 있으며 새 폴더는 부모 정책을 상속합니다. 문서 생성과 수정은 모두 `Draft → In review → Published` 흐름을 거칩니다. 검토자는 업데이트를 요청할 수 있고, 수정·재제출 시 이전 승인은 무효화됩니다. 여러 문서를 하나의 요청에 담을 수 있습니다. 마지막 필수 Owner의 승인이 원격 commit/push를 수행하며, 성공 후에만 발행 상태를 표시합니다.

발행 직전에 현재 승인 경로와 문서 내용 해시를 확인합니다. 같은 문서의 경합은 차단하고, 무관한 문서의 변경은 허용합니다. push 실패 시 checkout을 되돌리고 제안을 보존합니다. push 직후 프로세스가 중단돼도 commit의 CR 정보로 SQLite 상태를 복구합니다. 외부 변경은 60초마다 또는 수동 새로고침 시 반영합니다.

### AI Prompt

모든 화면 상단에 같은 AI Prompt 버튼을 제공합니다. **Portal → 상속된 폴더 instructions → 6개 task template → 개인 task 설정 → 화면 context → 추가 지시** 순서로 조합합니다. 조사·검색·CR 초안·CR 리뷰·영향 조사·요약을 지원합니다. 생성된 prompt를 복사해 기존 Coding Agent에서 사용합니다. 자체 AI 실행기나 workflow engine은 없습니다.

## MCP 연결

Streamable HTTP endpoint: **`/mcp`**. 로컬 기본 주소는 `http://127.0.0.1:3001/mcp`입니다. 클라이언트에 다음 HTTP header를 설정하세요.

```text
Authorization: Bearer <KNOWLEDGE_MCP_TOKEN>
```

데모 기본 토큰은 `knowledge-wiki-local-demo`이며 운영에서는 사용하지 않습니다. 클라이언트별 MCP 설정 형식은 다를 수 있습니다.

| Tool                    | 용도                                                                    |
| ----------------------- | ----------------------------------------------------------------------- |
| `search_knowledge`      | 폴더 범위 FTS5 검색, 최대 20개 스니펫·줄 범위·revision                  |
| `read_document`         | 최대 200줄 / 24,000자. `nextLine`, `nextColumn`으로 이어 읽기           |
| `get_change_request`    | CR metadata 또는 선택한 파일의 원본/제안 구간. 전체 파일 자동 전송 없음 |
| `create_change_request` | 현재 `baseHash`와 제안 내용으로 초안/변경 요청 생성                     |
| `build_prompt`          | 상속 규칙과 작업 context를 반영한 prompt 생성                           |

AI 인증은 전용 bearer token을 사용합니다. AI는 검토 문맥 조회와 제안만 가능하며, 승인·거버넌스 API는 사용할 수 없습니다. 개인 customization은 인증된 Web 사용자의 prompt에 적용됩니다.

## 사내 운영

1. 서비스 계정이 읽기·쓰기를 할 수 있는 **전용 remote repository**를 준비합니다. 비어 있으면 최초 시작 시 root 폴더만 초기화합니다. 예시 문서는 운영에 생성하지 않습니다.
2. `docs/users.example.json`을 참고해 사용자 목록을 준비하고 SSO subject와 `id`를 일치시킵니다. 계정·권한 관리 화면이나 자체 비밀번호 저장은 제공하지 않습니다.
3. `.env.example`의 운영 설정을 모두 채웁니다. `KNOWLEDGE_MODE=production`, remote, root owner, users file, origin, 32자 이상의 서로 다른 proxy/MCP secret이 필수입니다. Git 인증은 서비스 계정의 SSH key 또는 Git credential helper를 사용합니다.
4. 기존 사내 SSO reverse proxy 뒤에 서버를 둡니다. Proxy는 인증 후 **`X-Auth-User`** 및 서버와 공유하는 **`X-Proxy-Secret`**를 주입해야 합니다. 클라이언트가 보낸 동명 header는 반드시 제거/덮어쓰고, 서버 포트는 proxy에서만 접근 가능하게 제한합니다. 브라우저 Origin은 `KNOWLEDGE_ORIGIN`과 일치해야 합니다. MCP는 사용자 header 대신 별도 bearer token으로 접근합니다. 외부 구간은 TLS를 사용하세요.
5. `npm run build && npm start` 또는 포함된 `Dockerfile`로 실행합니다. Docker는 `/data` 볼륨과 사용자 파일, Git 인증 설정을 마운트하고 운영 환경변수를 전달해야 합니다. 수십 명 규모의 **단일 인스턴스**를 전제로 합니다.

기존 저장소는 Markdown 문서와 `.knowledge/folders.json`을 사용합니다. 각 문서의 부모 경로를 manifest에 등록하세요. 형식 예시:

```json
[
  {
    "path": "",
    "name": "Knowledge",
    "ownerId": "sunho",
    "policy": "local",
    "instructions": "Cite sources.",
    "description": "Engineering knowledge"
  },
  {
    "path": "architecture",
    "name": "Architecture",
    "ownerId": null,
    "policy": null,
    "instructions": "Check failure modes.",
    "description": "Design decisions"
  }
]
```

Root 외 폴더의 `ownerId`와 `policy`가 `null`이면 상속합니다. 문서는 UTF-8 `.md`, 개별 파일 20 MB 이하를 지원합니다. Web/MCP 제안은 파일당 2백만 문자, 요청당 10개 문서, HTTP body 22 MB까지입니다. 더 큰 문서는 관리자가 적절한 문서 단위로 나누어야 합니다. 파일 경로 traversal, hidden 경로, symlink는 허용하지 않습니다.

## 백업과 복구

```sh
npm run backup -- /secure/backups/knowledge-2026-09-29
```

SQLite online backup과 원격 Git mirror를 같은 폴더에 생성합니다. 실행 중에도 SQLite 파일은 일관되게 백업되지만, **workflow DB와 remote 간 동일 시점 복구가 필요하면 쓰기를 잠시 중단**한 뒤 수행하세요. users 파일과 배포 설정·인증정보는 별도 보안 백업에 보관합니다. checkout과 FTS 색인은 원본이 아니므로 재생성할 수 있습니다.

복구 시 서버를 중지하고, remote mirror를 Git 서버에 복원한 뒤 `knowledge.sqlite`을 빈 데이터 디렉터리에 복사하세요. 해당 디렉터리를 `KNOWLEDGE_DATA_DIR`로 설정해 시작하면 checkout을 다시 복제하고 색인·발행 상태를 재조정합니다. 기존 DB 위에 덮어쓰는 경우 기존 `-wal`, `-shm`을 섞지 말고 새 디렉터리를 사용하세요.

`GET /api/health`는 `ok` 또는 `degraded`를 반환합니다. 동기화 실패 시 마지막 정상 문서는 열람 가능하지만 새 발행은 실패합니다. 서버 로그, 서비스 계정의 remote 접근, 디스크 공간을 우선 확인하세요. push 실패는 권한·연결·branch protection 설정을 점검하고 기존 CR에서 승인 재시도를 할 수 있습니다.

## 검증

```sh
npm test
npm run typecheck
npm run build
```

실제 임시 Git remote/SQLite 통합 테스트: 책임·정책 상속, Cascade, 비Owner·AI 승인 차단, 제안 버전 경합, 문서 충돌, push 실패·재시도, 발행 복구, 대형 문서 부분 읽기, prompt 순서, 저장 지속성, 운영 인증, 공식 MCP SDK client 통신. 브라우저 검증 내용은 [verification.md](docs/verification.md)에 기록합니다.

현재 범위는 문서 열람·제안·승인과 책임 관리입니다. 실시간 공동 편집, 메일 알림, 문서 삭제/이동, semantic/vector 검색, 첨부 파일 관리, 다중 서버 운영은 포함하지 않습니다.
