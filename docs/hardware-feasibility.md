# Hardware feasibility gate

No wearable behavior is considered implemented until this table has real-device evidence.

## Device under test

| Field | Value |
| --- | --- |
| Product | Ray-Ban Meta Wayfarer (exact generation unknown) |
| Model number | To record |
| Glasses firmware | To record |
| iPhone model | To record |
| iOS version | To record |
| Meta View / companion version | To record |
| Meta Wearables SDK version | To select after terms review |

## Required experiments

| Requirement | Test method | Pass criterion | Status |
| --- | --- | --- | --- |
| Glasses-only microphone | Inspect `AVAudioSession` input UID/port while recording a known near/far signal | Selected glasses UID remains active; phone-local signal is absent | Not run |
| Route-change shutdown | Disconnect glasses and force route changes during capture | Capture callback and network sender stop before accepting built-in mic buffers | Not run |
| Locked-screen wake | Lock for 30/60 minutes, speak wake/non-wake corpus | Supported duration and termination reasons recorded | Not run |
| Background/interruption | Background app, receive call, revoke permission, change network | State becomes Interrupted/Stopped truthfully; no fallback | Not run |
| One-shot photo | Request, cancel, timeout, fail, and succeed | Camera session is absent after every path; no local file remains | Not run |
| Battery | Measure idle, wake-listening, and conversation for one hour | Drain and thermal state recorded; product threshold then chosen | Not run |

## Wake-engine selection

Do not select a wake engine by popularity. Test at least two locally running candidates using a corpus containing both configured phrases, normal conversation, television/audio playback, accents represented by users, and near-confusable phrases.

Record false accepts/hour, false rejects, median activation latency, CPU, one-hour battery change, binary/model size, offline behavior, privacy characteristics, and distribution license. The selected engine must support runtime-customized phrases or the product must accurately disclose any retraining/enrollment limitation.

## Fail-closed outcome

If the exact glasses/firmware cannot expose a stable microphone route or iOS does not allow the required listening lifetime, Meta Gunu will mark glasses wake as unsupported on that configuration. It will not substitute the iPhone microphone. Explicit **Talk on iPhone** remains a separate mode.
