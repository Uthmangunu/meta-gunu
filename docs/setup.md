# Local setup

1. Install Node.js 20+, Swift 6+/Xcode, Docker, and optionally XcodeGen.
2. Create `.secrets/postgres_password` with a generated local password. Copy `.env.example` to `.env`, place that password in `DATABASE_URL`, and replace every other placeholder. The `.secrets` directory and `.env` are ignored by Git.
3. Start PostgreSQL with `docker compose up -d postgres`. The development container binds to host port `55432` to avoid a common local PostgreSQL conflict.
4. Run `npm install`, `npm run db:migrate`, then `npm run dev:gateway`.
5. Generate the iOS project from `apps/ios/project.yml`; set the local gateway URL and development bearer token only in a local Xcode configuration.
6. For laptop tasks, install and authenticate the Codex CLI, set `CODEX_WORKSPACE` to an allowed project directory, and run `npm run dev:connector`.

Never commit `.env`, Xcode user settings, provider keys, pairing tokens, recordings, or captured images.

The connector permits only the configured workspace. Start with Codex approvals enabled. Existing desktop tasks are out of scope until `thread/list` and `thread/read` compatibility are tested against the user's installed Codex version.
