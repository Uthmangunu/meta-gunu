# Verification strategy

## Automated checks

```bash
npm test
npm run typecheck
swift test --package-path packages/swift/MetaGunuCore
cd apps/ios && xcodegen generate
xcodebuild -project MetaGunu.xcodeproj -scheme MetaGunu -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/meta-gunu-derived CODE_SIGNING_ALLOWED=NO build
```

TypeScript tests cover wire validation, Live relay policy, spending limits, and task idempotency. Swift tests cover explicit phone intent, phone and glasses route-loss suspension, glasses route matching, end-session behavior, and stop semantics.

## Manual iPhone tests

Use a physical iPhone and the exact glasses configuration recorded in `hardware-feasibility.md`. Test opening the app, glasses absent, Bluetooth disconnect, manual route change, screen lock, backgrounding, calls, Siri/audio interruptions, permission revocation, network handoff, thermal pressure, low battery, and force quit.

For each case record:

- iPhone/iOS and glasses firmware;
- starting state and exact action;
- observed input route UID before and after;
- whether any audio buffer reached the sender;
- visible state and recovery path;
- timestamps and battery/latency measurements.

### Phone voice prototype

1. Confirm launching and navigating the app does not show the iOS microphone indicator.
2. Start the gateway with a test OpenAI project and open **Talk on iPhone**. Confirm the permission prompt occurs only after the tap.
3. Verify a spoken turn produces streamed reply audio and transcript text, then use **End session** and confirm the microphone indicator disappears.
4. During a turn, attach or select a Bluetooth input. Confirm the current input buffer is discarded, the UI becomes Interrupted, the socket closes, and there is no capture from the new route.
5. Repeat with network loss, provider rejection, backgrounding, a call, and permission revocation. Record evidence before marking the prototype integration-verified.

## Release blockers

- Any phone-microphone capture without an explicit phone-mode tap.
- Any camera session that survives success, error, cancellation, or timeout.
- Duplicate task or approval after reconnect.
- A forgotten memory appearing in retrieval.
- Consequential external action without a fresh, scoped approval.
- Marketing or documentation claiming an unverified hardware capability.
