# Verification strategy

## Automated checks

```bash
npm test
npm run typecheck
swift test --package-path packages/swift/MetaGunuCore
cd apps/ios && xcodegen generate
xcodebuild -project MetaGunu.xcodeproj -scheme MetaGunu -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/meta-gunu-derived CODE_SIGNING_ALLOWED=NO build
```

TypeScript tests cover wire validation, spending limits, and task idempotency. Swift tests cover explicit phone intent, glasses route matching, route-loss suspension, end-session behavior, and stop semantics.

## Manual iPhone tests

Use a physical iPhone and the exact glasses configuration recorded in `hardware-feasibility.md`. Test opening the app, glasses absent, Bluetooth disconnect, manual route change, screen lock, backgrounding, calls, Siri/audio interruptions, permission revocation, network handoff, thermal pressure, low battery, and force quit.

For each case record:

- iPhone/iOS and glasses firmware;
- starting state and exact action;
- observed input route UID before and after;
- whether any audio buffer reached the sender;
- visible state and recovery path;
- timestamps and battery/latency measurements.

## Release blockers

- Any phone-microphone capture without an explicit phone-mode tap.
- Any camera session that survives success, error, cancellation, or timeout.
- Duplicate task or approval after reconnect.
- A forgotten memory appearing in retrieval.
- Consequential external action without a fresh, scoped approval.
- Marketing or documentation claiming an unverified hardware capability.
