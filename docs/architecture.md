# Architecture

## System flow

```text
selected glasses mic ──> local wake detector ──> guarded audio capture
                                                     │
                                                     v
                                           OpenAI Live session
                                                     │
                         ┌───────────────────────────┴──────────────────────┐
                         v                                                  v
                 Responses research                              laptop task router
                         │                                                  │
                   sourced result                                  outbound WSS link
                         │                                                  │
                         └────────────> iPhone cards <──────── Codex app-server
```

The phone app owns microphone consent and route enforcement. The cloud is never trusted to determine which physical input is active. Audio transmission may begin only when the local `CompanionStateMachine` and current route both permit it.

For the phone prototype, native `AVAudioEngine` capture is converted in memory to mono 24 kHz PCM and sent over an authenticated WebSocket to the gateway. The gateway owns the OpenAI credential, checks the configured spending limit, creates the server-owned Live session configuration, and relays only validated audio/close events. Provider audio is returned over the same socket for in-memory playback. No raw audio is written by Meta Gunu.

## iPhone boundaries

- `AudioRouteProviding`: reports a stable selected-glasses identity and route changes.
- `AudioCapture`: starts only after an `AudioRoutePolicy` decision and stops synchronously.
- `WakeDetecting`: consumes glasses-sourced PCM locally; it does not control the microphone.
- `VoiceSession`: establishes, mutes, and closes a hosted voice conversation.
- `RequestedImageCapturing`: opens one requested capture and guarantees teardown.
- `MemoryServing` and `TaskServing`: communicate with the gateway.

The platform-independent package contains the state machine so the most important safety behavior is unit-testable without AVFoundation or a device.

## Cloud gateway

The gateway is a trusted server boundary. It holds provider credentials and exposes:

- `POST /v1/live/sessions`: validates source intent and proxies a WebRTC offer to OpenAI Live.
- `GET /v1/live/connect` (WebSocket upgrade): authenticated native-client relay for the explicit phone voice prototype.
- `POST /v1/research`: invokes the Responses API with web search and returns text plus source links.
- `GET/POST/PATCH/DELETE /v1/memories`: user-controlled durable memory.
- `POST/GET/DELETE /v1/tasks`: idempotent task submission, status, and cancellation.
- `GET/POST /v1/approvals`: list pending approvals and deliver a user's scoped decision.
- `/v1/laptop/connect`: authenticated outbound connector channel.

The initial server uses a bearer development token. Production deployment is blocked until a real identity provider, scoped device credentials, rotation, and audit logging are added.

## Laptop connector

The connector initiates outbound WSS, so a home laptop does not expose an inbound port. It launches `codex app-server` locally over stdio, completes the documented initialize handshake, starts or resumes Meta Gunu-owned threads, and forwards streamed events. Server-initiated approval requests are forwarded to the phone; the connector never accepts them automatically.

Codex task IDs, thread IDs, and idempotency keys are distinct. The gateway stores all three so reconnecting can resume instead of re-running work.

## Memory

Conversation messages, durable memories, and ongoing tasks have separate tables and retention controls. Memories carry source references and timestamps. Deletion is a tombstone (`deleted_at`) and every retrieval query excludes tombstoned rows. Private conversations set `is_private` and cannot feed durable-memory promotion.

Raw audio and requested images are transient application data and are not written to the application database.

## Provider configuration

Model IDs live in server environment variables because available models change. As of 2026-09-18 the official API reference documents `gpt-live-1` for Live sessions and current Responses models including `gpt-6-astra`. Integration tests must re-verify access for the actual OpenAI project before deployment.

See ADR-0003 for the native WebSocket relay decision. The official Live reference requires a primary WebSocket client to send `session.start`, wait for `session.started`, and send PCM audio with `session.input_audio.append`; WebRTC remains available as a later transport when its benefits justify a client dependency.
