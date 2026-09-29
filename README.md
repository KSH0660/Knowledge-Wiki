# Knowledge Wiki

사내 엔지니어를 위한 가벼운 지식 거버넌스 플랫폼. 지식은 **Workspace** 단위로 나뉘고, Workspace마다 독립적인 Git repository가 원본(source of truth)입니다. 사람은 Web UI로 읽고 변경을 제안·검토하며, Coding Agent는 MCP로 같은 지식을 검색하고 제안·ingest합니다. 사람이 Git 파일을 직접 수정하는 일은 없습니다. 필요한 승인이 끝나면 Knowledge Wiki가 파일을 쓰고 commit/push합니다.

## 실행

Node.js **24 이상**과 Git이 필요합니다(이번 검증은 Node.js 22.22에서 수행).

```sh
npm ci
npm run dev
```

**http://127.0.0.1:5173** 에서 시작합니다. 별도 설정 없이 `.data/`에 SQLite, checkout, 로컬 bare remote를 만들고 예시 Workspace(Engineering)와 검토 요청을 넣습니다. 우측 상단 프로필에서 데모 사용자(Sunho/Alex/Yuna/Min)를 전환할 수 있습니다. 데모는 loopback에서만 실행됩니다.

```sh
npm run build
npm start          # http://127.0.0.1:3001 (UI + API + MCP)
```

`.env.example`을 `.env`로 복사하면 실행 스크립트가 자동으로 읽습니다. 런타임에 외부 CDN, 폰트, AI API를 호출하지 않습니다.

## 구성

```text
React Web UI ──┐                    ┌─ SQLite: 사용자 설정·CR·리뷰·Import staging·Workspace 목록·FTS5 색인
MCP (HTTP) ────┴─ Node / Express ───┤
                                    └─ Workspace별 Git repository: 문서·폴더 거버넌스·이력
```

- `server/portal.ts`: Workspace 목록, 생성(생성자 = Root Owner), portal-wide AI instruction.
- `server/service.ts`: Workspace 하나의 책임·승인·검색·읽기 규칙(Web/MCP 공용).
- `server/prompt.ts`: 화면·역할에 맞는 task 자동 선택과 Markdown prompt 조합.
- `server/imports.ts`: Import Session(staging) — directory migration과 normalized document ingest.
- `server/repository.ts`: Workspace별 checkout, 원격 동기화, 발행, 이력, outline/provenance 파싱.
- `server/mcp.ts`: MCP tool 정의. 상세 설계는 [architecture.md](docs/architecture.md), ingest 계약은 [ingest.md](docs/ingest.md).

## Workspace와 책임

- **누구나 Workspace를 만들 수 있고**, 만든 사람이 Root Owner가 됩니다. Workspace마다 별도 Git repository가 생기며(기본: 데이터 디렉터리의 bare repository, 운영: `KNOWLEDGE_WORKSPACE_REMOTE_TEMPLATE`) 한 Workspace의 변경은 다른 Workspace의 history에 나타나지 않습니다.
- Workspace 안의 folder/document 계층은 자유입니다. **가장 가까운 Owner**가 책임자이고, 하위 folder에 Owner를 지정하면 그 지점부터 책임이 바뀝니다. Owner·정책·AI instruction은 모두 하위로 상속됩니다.
- **Local**: 가장 가까운 Owner의 승인. **Cascade**: 가장 가까운 Owner + 상위 ownership chain의 모든 Owner 승인.
- **Required approval과 FYI는 분리됩니다.** Local 정책에서 상위 Owner는 FYI(통보만, 승인 불필요)이고, folder별 **watcher**를 FYI로 지정할 수 있습니다. FYI 대상자는 승인할 수 없으며 My reviews의 FYI 탭과 Home에 별도로 표시됩니다. 제안자 자신은 FYI에서 제외됩니다.
- 거버넌스 변경은 해당 영역의 Owner(또는 운영 admin)만 가능하고, 변경은 시스템이 Git에 기록합니다.

## 변경 흐름

`propose → review → approve / request changes / reject → system write → git commit/push`

- 제안(CR)은 SQLite staging에만 존재합니다. 승인 전·반려·거절된 내용은 source repository에 들어가지 않습니다.
- 마지막 필수 승인 시 Knowledge Wiki가 파일을 쓰고 `Knowledge-Wiki-Change`, `Approved-by` trailer가 있는 commit을 push합니다. 새 하위 folder가 필요하면 같은 commit에서 등록합니다(상위 책임 상속).
- 요청 수정 후 재제출하면 이전 승인은 무효가 됩니다. **Reject**는 종결 상태이며 Git에 아무것도 쓰지 않습니다.
- Agent는 큰 문서를 다시 보내지 않고 `edits`(정확히 한 번 일치하는 `old_text` → `new_text`)로 제안할 수 있습니다.
- 발행 직전 문서 hash와 원격 tip을 확인하고, push 실패 시 checkout을 되돌리며 제안을 보존합니다. push 후 중단돼도 commit trailer로 상태를 복구합니다.

## AI Prompt — 1-click Copy

모든 화면 상단의 **Copy prompt** 버튼 하나로 그 화면·그 사용자에게 가장 알맞은 최종 prompt가 clipboard에 들어갑니다. 페이지에 들어오는 순간 prompt를 미리 조립해 두므로 클릭 즉시(수십 ms) 복사되며, modal·task 선택·설정이 필요 없습니다. 버튼 옆에 선택된 task가 표시됩니다.

- Clipboard에는 **Markdown source**(`#`, `##`, 목록, fenced code)만 들어갑니다. 화면의 미리보기는 렌더링하지만 복사는 항상 원본 Markdown입니다.
- 조합 순서: **Portal-wide instruction → Workspace + folder 상속 instruction → task template → 개인 설정(Global → task별) → 현재 화면 context → one-off instruction**.
- Task는 서버가 화면과 역할로 고릅니다: 문서·folder → Explain, 필수 승인자가 보는 CR → Review, 작성자가 수정 요청을 받은 CR → Draft(피드백 포함), FYI 대상자의 CR → Impact check, 빈 Workspace → Ingest, 제출된 Import(Root Owner) → Review, 편집 화면 → Draft CR, 그 외 → Summarize. (Explain / Investigate / Find related / Draft CR / Review / Impact check / Summarize / Ingest)
- Context에는 workspace, folder, 문서 경로·hash·provenance·주요 section, CR 상태·필수 승인/FYI·근거·최근 피드백, 그리고 바로 실행할 **MCP 호출(Start with)** 이 들어갑니다.
- 사용자 정의는 부가 기능입니다. 버튼 옆 ▾(또는 ⚙)로 drawer를 열어 task 변경, one-off instruction, "이 task에 저장/모든 task에 저장"을 할 수 있고, AI prompt settings 화면에서 Global·task별 개인 설정을 관리합니다. Portal-wide instruction은 admin이 수정합니다. Folder Owner는 자신의 folder에 AI instruction을 추가하고 하위로 상속합니다.

## MCP 연결

Streamable HTTP endpoint **`/mcp`** (기본 `http://127.0.0.1:3001/mcp`), header `Authorization: Bearer <KNOWLEDGE_MCP_TOKEN>`. 데모 토큰은 `knowledge-wiki-local-demo`입니다. 모든 결과는 compact JSON metadata와, 본문이 있으면 별도의 raw Markdown text block으로 돌려줍니다.

| Tool | 용도 |
| --- | --- |
| `list_workspaces` | Workspace 목록(slug, root owner, 규모) |
| `browse` | folder 구조·effective owner/policy·문서 목록(본문 없음) |
| `search_knowledge` | FTS5 검색. hit마다 section 제목, 가장 잘 맞는 `line`, chunk 범위, snippet |
| `get_document_outline` | heading·section 번호·줄 범위, hash, provenance |
| `read_document` | `section`(번호/제목) 또는 줄 범위(≤200줄, ≤24,000자)로 부분 읽기 |
| `get_change_request` | CR metadata, 파일별 `diff` hunk 또는 원본/제안 범위 읽기 |
| `create_change_request` | 제안 생성/수정(`edits` 또는 `content`). 승인·발행은 불가 |
| `build_prompt` | Web UI가 복사하는 것과 같은 Markdown prompt |
| `start_import` / `stage_import_files` / `stage_normalized_documents` / `get_import` / `submit_import` | Agent-driven migration·ingest (아래) |

AI identity는 승인·거버넌스·Import commit을 할 수 없습니다.

## Agent-driven migration / ingest

Knowledge Wiki는 PDF parser가 아닙니다. 해석은 Coding Agent가 외부에서 하고, Knowledge Wiki는 staging과 승인·기록을 맡습니다. 빈 Workspace 화면의 **Copy ingest prompt**가 전체 절차를 담고 있습니다.

1. `start_import` → Import Session(staging). 이 단계에서는 Git에 아무것도 쓰지 않습니다.
2. **Directory migration**: `stage_import_files`로 curated Markdown을 원래 상대 경로·파일명 그대로 보냅니다. cache/build/log/temp/generated/hidden/비-Markdown 파일은 서버가 제외하고 사유를 돌려줍니다. 내용 rewrite·재구성은 하지 않습니다.
3. **외부 문서(PDF 등)**: Agent가 TOC → section → page 범위를 점진적으로 읽어 해석하고, `stage_normalized_documents`로 `document / section / content / provenance`(출처, section 번호, 1-based PDF page)를 보냅니다. 서버가 front matter와 section별 `> Source:` 줄을 기록합니다.
4. `submit_import`에 구조 개선 **suggestions**를 남깁니다(적용하지 않음). Commit 후 각 suggestion에서 Draft CR prompt를 1-click으로 복사할 수 있습니다.
5. **Root Owner가 Import 화면에서 한 번 검토하고 commit**하면 하나의 initial commit으로 기록됩니다. Discard하면 아무것도 남지 않습니다. 이미 발행된 경로는 Import로 덮어쓸 수 없고 CR을 사용합니다.

계약 상세와 예시: [docs/ingest.md](docs/ingest.md).

## 사내 운영

1. 기본 Workspace용 **전용 remote repository**를 준비합니다(`KNOWLEDGE_REMOTE`). 사용자가 만드는 Workspace는 `KNOWLEDGE_WORKSPACE_REMOTE_TEMPLATE`(예: `ssh://git@git.internal/knowledge/{slug}.git`, 미리 만든 빈 repository)로 연결하거나, 설정하지 않으면 서비스가 데이터 디렉터리에 bare repository를 관리합니다.
2. `docs/users.example.json`을 참고해 사용자 목록을 준비하고 SSO subject와 `id`를 맞춥니다.
3. `.env.example`의 운영 설정을 채웁니다. `KNOWLEDGE_MODE=production`, remote, root owner, users file, origin, 32자 이상의 서로 다른 proxy/MCP secret이 필수입니다.
4. 사내 SSO reverse proxy 뒤에 둡니다. Proxy는 인증 후 **`X-Auth-User`** 와 **`X-Proxy-Secret`** 을 주입해야 하며 클라이언트가 보낸 동명 header는 제거합니다. MCP는 별도 bearer token을 씁니다.
5. `npm run build && npm start` 또는 `Dockerfile`로 실행합니다. 수십 명 규모의 **단일 인스턴스**를 전제로 합니다.

각 Workspace repository는 Markdown 문서와 `.knowledge/folders.json`(folder별 `ownerId`, `policy`, `instructions`, `description`, 선택적 `watchers`)을 사용합니다. Root 외 folder의 `ownerId`/`policy`가 `null`이면 상속합니다. 문서는 UTF-8 `.md`, 개별 파일 20 MB 이하입니다. 기존 v1 데이터베이스는 시작 시 기본 Workspace로 자동 migration됩니다.

## 백업과 복구

```sh
npm run backup -- /secure/backups/knowledge-2026-09-29
```

SQLite online backup과 **모든 Workspace repository의 mirror**(`workspaces/<slug>.git`)를 만듭니다. DB와 repository의 동일 시점 복구가 필요하면 쓰기를 잠시 멈춘 뒤 수행하세요. 복구 시 mirror를 Git 서버에 되돌리고 `knowledge.sqlite`를 빈 데이터 디렉터리에 복사해 `KNOWLEDGE_DATA_DIR`로 시작하면 checkout과 색인을 재생성합니다. `GET /api/health`는 전체 Workspace 상태를 `ok`/`degraded`로 알려줍니다.

## 검증

```sh
npm test
npm run typecheck
npm run build
```

실제 임시 Git remote/SQLite 통합 테스트 20개와, 공개 사양(RISC-V Privileged ISA, ACPI 6.6)으로 수행한 end-to-end 검증 결과는 [verification.md](docs/verification.md)에 있습니다.

현재 범위에 없는 것: 실시간 공동 편집, 메일/메신저 알림(FYI는 앱 내 표시), 문서 삭제/이동, semantic/vector 검색, Workspace별 접근 제어, 다중 서버 운영.
