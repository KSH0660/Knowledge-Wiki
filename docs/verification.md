# Verification

Verified on 2026-09-29 with Node.js 24.21.0.

- TypeScript checking and the production Vite build pass.
- 13 integration scenarios use temporary real Git remotes and SQLite databases: inherited responsibility, cascading approval, human/owner authorization, proposal version conflicts, concurrent comments, document conflicts, failed pushes and retry, recovery after publication, bounded large-document reads, prompt composition, persistence, and official MCP client calls with production authentication.
- Desktop browser inspection at 1440 × 1000: Home, Knowledge browser, document rendering, contextual prompt drawer, and document-to-change navigation. The application loads and reads actual server data. Prompt copying was exercised.
- The online SQLite backup and Git mirror backup command completed successfully.

The browser creation → approval → publication scenario and mobile visual checks were not completed before the requested main-branch delivery. The workflow itself is covered by the integration tests. Docker/SSO deployment was not exercised against an actual internal environment.

Build note: Vite reports a non-blocking warning for a client bundle slightly above 500 kB (approximately 157 kB gzip).
