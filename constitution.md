# Meta Gunu constitution

Last verified: 2026-09-21 on branch `codex/live-endpoint-readiness`.

This file is the project's living memory and rulebook. Code-changing pull requests must update it. Detailed history belongs in linked ADRs and documentation; this file records the current truth.

## Product intent

Meta Gunu is a calm, general-purpose conversational companion. Musa answers questions, follows natural conversation, performs sourced research, recalls user-controlled memories, and can delegate suitable work to a paired laptop. It is not primarily a booking or coding product, and it must remain useful while the laptop is offline.

The owner's profile uses assistant name **Musa** and wake phrase **Kai Musa**. Other profiles default to **Gunu** and **Hey Gunu**. Wake phrases are configurable after a manual listening start.

## Listening invariants

1. Opening or foregrounding the app never starts the iPhone microphone.
2. Glasses mode begins only after an explicit user action and accepts audio only from the selected glasses route.
3. If glasses disconnect or the input route changes, capture and transmission suspend immediately. There is no silent phone fallback.
4. Phone mode uses the built-in microphone only after an explicit **Talk on iPhone** action.
5. In glasses mode, the wake engine runs locally on glasses-sourced audio. A wake opens one cloud conversation that continues until **end session**.
6. **end session** closes the cloud session and, when safe, returns to local glasses wake listening. **Stop listening** releases all audio capture.
7. Calls, permissions, budgets, networking, and OS interruptions may suspend a session. UI state must tell the truth.
8. Camera capture is one-shot and request-scoped. Every success, failure, timeout, and cancellation releases the camera. Images are not saved by default.

## Architecture

- Native SwiftUI iPhone application.
- Swift domain package owns the listening state machine and replaceable service interfaces.
- TypeScript gateway owns authentication, budgets, OpenAI Live session negotiation, Responses research, memories, and task routing.
- PostgreSQL stores conversation, durable memory, tasks, approvals, devices, and usage records.
- A TypeScript laptop connector makes an authenticated outbound connection and controls a local Codex app-server process over documented JSON-RPC.
- Stable IDs and database uniqueness prevent retries from duplicating tasks or approvals.

See `docs/architecture.md` and ADRs in `docs/decisions/`.

## Verified implementation status

Implemented and covered by automated checks:

- Audio-source policy and session state transitions are represented in a platform-independent Swift package.
- The policy rejects a built-in phone route in glasses mode and suspends on route changes.
- Phone mode requires explicit intent in the state transition API.
- Stop and end-session semantics are represented in the reducer.
- SwiftUI shell displays Stopped, Waiting for wake phrase, Conversing, and Interrupted states plus the active source.
- Shared TypeScript schemas validate session, task, memory, and connector messages.
- The Live relay checks explicit source intent and budget state, keeps the provider credential and session configuration server-side, and accepts only audio-append and close events from the phone.
- Gateway primitives enforce configured budgets and idempotent task creation.
- Gateway supports task polling/cancellation and explicit pending-approval listing/resolution.
- PostgreSQL schema separates conversations, memories, tasks, approvals, devices, and usage.
- Codex bridge implements initialize/initialized, thread start/resume, turn start, notification streaming, interruption, and explicit approval responses over stdio.

Compile-verified but not provider/device integration-verified:

- **Talk on iPhone** is the only implemented code path that requests phone microphone permission, activates the audio session, and explicitly selects the built-in input.
- Native phone capture converts buffers to mono 24 kHz PCM in memory, checks the expected route on every buffer, and tears down capture on route mismatch, session end, stop, or connection failure.
- The iPhone client can stream capture audio, play Live output audio, and display transcript deltas through an authenticated gateway WebSocket.
- OpenAI primary Live WebSocket connection from the gateway, using the currently documented `/v1/live/sessions` endpoint and waiting for `session.started` before accepting phone audio.

Scaffolded but not integration-verified:

- OpenAI Live WebRTC proxy boundary (`POST /v1/live/sessions`).
- Responses research with web search and source extraction.
- Authenticated outbound laptop WebSocket.
- iPhone API client and one-shot camera protocol.

Not implemented or not verified:

- Meta glasses SDK integration and glasses microphone access.
- Wake engine selection and recognition.
- iOS WebRTC media transport.
- Real camera capture from the glasses.
- Background/locked-screen endurance.
- Production identity provider, encryption key management, and deployment.
- Shared history with pre-existing Codex desktop tasks.
- Booking or other consequential third-party actions.

## Decisions

- Clean-room MIT implementation; VisionClaw is inspiration only. See ADR-0001.
- Fail-closed audio routing controlled by a state machine. See ADR-0002.
- The phone prototype uses a gateway-owned native Live WebSocket relay to avoid a third-party WebRTC dependency while preserving local route control. See ADR-0003.
- Current OpenAI model identifiers are server configuration, never compiled into the app.
- Codex app-server is preferred over pretending the cloud model has access to the user's laptop.
- The app begins with development-token authentication; it must not be exposed publicly until production auth is installed.

## Known limitations

- iOS can change Bluetooth routes due to calls, battery state, or the operating system. Background execution is constrained and must be measured on device.
- A Bluetooth device being named like glasses is not sufficient identity. Production selection must bind to a verified route/device identifier.
- Codex app-server WebSocket transport is documented as experimental; the connector therefore uses its stable local stdio transport and owns the cloud outbound connection separately.
- OpenAI and Meta provider retention is distinct from Meta Gunu storage policy and must be documented at deployment time.

## Test evidence

Verified locally on 2026-09-18:

- `npm test`: 9 tests passed across 5 source test files.
- `npm run typecheck`: passed with strict TypeScript settings.
- `npm run build`: passed.
- `swift test --disable-sandbox --package-path packages/swift/MetaGunuCore`: 9 tests passed. `--disable-sandbox` was needed only because the surrounding Codex workspace sandbox blocked SwiftPM's nested sandbox.
- XcodeGen 2.46.0 generated the project and the phone voice prototype produced a successful unsigned generic iOS Simulator build with Xcode 26.2. Audio and provider behavior were not exercised by that compile.
- PostgreSQL 17 migration completed against a clean local Docker volume on port 55432.
- Gateway smoke test returned healthy and an authenticated zero-spend budget snapshot.
- `npm audit`: 0 known vulnerabilities after upgrading Vitest to 4.1.11.

Verified locally on 2026-09-21:

- Re-checked the gateway protocol and primary WebSocket endpoint against the official OpenAI Live WebSocket guide.
- `npm test`: 10 tests passed across 5 source test files, including a regression assertion for `wss://api.openai.com/v1/live/sessions`.
- `npm run typecheck` and `npm run build`: passed.
- Swift package tests: 9 passed after placing the compiler module cache in the permitted temporary workspace.
- The phone app produced a successful unsigned generic iOS Simulator build with Xcode 26.2.
- A real credentialed provider session remains unverified.

Real-device test evidence is intentionally empty until the exact glasses model and firmware is recorded. Add dated results to `docs/hardware-feasibility.md`; do not convert unchecked rows into claims.

## Next steps

1. Record the exact Ray-Ban Meta Wayfarer generation, model number, iOS version, and firmware.
2. Prove or reject glasses-only microphone capture and route identity on a physical device.
3. Benchmark candidate local wake engines for Kai Musa/Hey Gunu accuracy, battery use, binary size, and license.
4. Run the explicit phone voice prototype against an authorized OpenAI project, then record physical-iPhone capture, playback, teardown, latency, and interruption evidence.
5. Compare the native WebSocket relay with WebRTC only after both can obey synchronous route shutdown.
6. Validate one-shot wearable camera access and lifecycle cleanup.
7. Add production authentication and deploy a private gateway.
8. Pair one laptop and run a controlled Codex task with approvals and reconnection deduplication.
