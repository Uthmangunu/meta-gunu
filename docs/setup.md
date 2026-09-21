# Local setup

1. Install Node.js 20+, Swift 6+/Xcode, Docker, and optionally XcodeGen.
2. Create `.secrets/postgres_password` with a generated local password. Copy `.env.example` to `.env`, place that password in `DATABASE_URL`, and replace every other placeholder. The `.secrets` directory and `.env` are ignored by Git.
3. Start PostgreSQL with `docker compose up -d postgres`. The development container binds to host port `55432` to avoid a common local PostgreSQL conflict.
4. Run `npm install`, `npm run db:migrate`, then `npm run dev:gateway`.
5. Generate the iOS project from `apps/ios/project.yml`. In the app's Settings screen, set the voice gateway and development bearer token. The Simulator default is `ws://localhost:8787/v1/live/connect`; a physical iPhone cannot use the Mac's `localhost`, so use a reachable TLS endpoint (`wss://`) or a deliberately secured development tunnel.
6. For laptop tasks, install and authenticate the Codex CLI, set `CODEX_WORKSPACE` to an allowed project directory, and run `npm run dev:connector`.

The gateway connects server-to-server to OpenAI's primary Live WebSocket at
`wss://api.openai.com/v1/live/sessions`. It sends `session.start` before any
audio and waits for `session.started`. Re-check the official Live WebSocket
guide before changing this transport because the older `/v1/live` path is not
the current primary Live sessions endpoint.

Never commit `.env`, Xcode user settings, provider keys, pairing tokens, recordings, or captured images.

The connector permits only the configured workspace. Start with Codex approvals enabled. Existing desktop tasks are out of scope until `thread/list` and `thread/read` compatibility are tested against the user's installed Codex version.

`Talk on iPhone` is the only control that requests microphone permission. The app first activates and explicitly selects the built-in input, establishes the Live relay, and only then starts audio buffers. Ending, stopping, a route mismatch, or a connection failure tears down capture. Do not enable broad cleartext transport exceptions for physical-device testing.
