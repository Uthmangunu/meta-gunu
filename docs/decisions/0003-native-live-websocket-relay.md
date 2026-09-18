# ADR-0003: Native Live WebSocket relay for the phone prototype

Status: accepted for prototype; real-device and provider validation pending.

## Context

The first runnable conversation slice must use only Apple platform frameworks, keep the OpenAI credential off the iPhone, and allow audio transmission to stop as soon as the local route guard fails. A direct WebRTC client would require an additional real-time communications framework. The official OpenAI Live API also supports a primary WebSocket: the client starts the session, waits for `session.started`, appends input audio, and receives output audio deltas.

## Decision

Use `AVAudioEngine` for explicit phone capture/playback and an authenticated WebSocket to the Meta Gunu gateway. The gateway checks the budget, owns the provider credential and immutable session configuration, and relays a narrow allowlist of client events. Use mono 24 kHz PCM in memory and configure `store: false`.

## Consequences

- The iOS prototype has no third-party media dependency and retains a synchronous local capture stop.
- Audio passes through the self-hosted gateway, adding bandwidth and latency and expanding the trusted deployment boundary.
- The development bearer token and cleartext localhost socket are not production authentication or transport.
- WebRTC can replace this transport behind `VoiceSessionServing` after measured comparison; the listening invariants do not change.
- Until a real OpenAI project and physical iPhone complete the documented tests, this path is compile-verified rather than integration-verified.

References: [Live primary WebSocket](https://developers.openai.com/api/reference/typescript/resources/live/methods/connect), [Live event and audio types](https://developers.openai.com/api/reference/typescript/resources/live).
