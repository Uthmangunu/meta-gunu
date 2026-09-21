# Meta Gunu

Meta Gunu is an open-source, iPhone-first conversational companion for Meta glasses. The personal assistant profile is **Musa**, woken with **“Kai Musa.”** New profiles default to **“Hey Gunu.”**

The product is designed around one safety rule: the phone microphone never starts merely because the app opened or a glasses route disappeared. Glasses listening and phone listening are explicit, separate modes.

## Current status

This repository contains the first engineering foundation:

- a testable Swift state machine that enforces audio-source isolation;
- a SwiftUI application shell with conversation, memory, tasks, and settings screens;
- a TypeScript gateway boundary for Live voice, research, memories, tasks, and budgets;
- a PostgreSQL schema with task idempotency and soft-deleted memories;
- a laptop connector built around Codex app-server's documented JSON-RPC protocol;
- project governance, architecture, privacy, hardware feasibility, and testing documentation.

It is **not yet a verified glasses build**. Meta wearable audio capture, custom wake detection, locked-screen endurance, one-shot camera access, and real OpenAI/Codex connections still require credentials and real-device validation. The UI labels these unavailable paths instead of simulating success.

## Repository map

```text
apps/ios/                 SwiftUI shell (generated with XcodeGen)
packages/swift/           Testable iOS domain and safety logic
packages/protocol/        Shared TypeScript wire schemas
services/gateway/         Cloud API and PostgreSQL boundary
services/codex-host/      Outbound laptop connector and Codex bridge
docs/                     Architecture, privacy, hardware, tests, ADRs
constitution.md           Living status and engineering memory
```

## Quick start

Requirements: Node.js 20+, Swift 6+, Docker, and Xcode 16+.

```bash
cp .env.example .env
npm install
npm test
npm run typecheck
swift test --package-path packages/swift/MetaGunuCore
docker compose up -d postgres
npm run db:migrate
npm run dev:gateway
```

To generate the iPhone project, install [XcodeGen](https://github.com/yonaskolb/XcodeGen), then run:

```bash
cd apps/ios
xcodegen generate
open MetaGunu.xcodeproj
```

The app can run in UI/demo mode without credentials. Network voice and research require `OPENAI_API_KEY`; the laptop connector additionally requires the Codex CLI and a paired gateway token. See [setup](docs/setup.md).

## Safety defaults

- Opening the app captures no audio.
- Glasses mode accepts only the specifically selected Bluetooth input route.
- A route change suspends capture before any fallback can occur.
- Phone mode starts only after **Talk on iPhone** is tapped.
- **Stop listening** releases all capture; **end session** returns glasses mode to local wake detection.
- Camera access is request-scoped and images are not persisted by default.
- Research can run in the cloud while the laptop is offline; laptop-only tasks report unavailable.
- Consequential actions require a separate approval and a tested integration.

## Development

Read [AGENTS.md](AGENTS.md) and [constitution.md](constitution.md) before changing code. Work starts on `codex/project-plan`; implementation changes use focused `codex/<feature>` branches and pull requests.

## Attribution and license

Meta Gunu was inspired by [VisionClaw](https://github.com/Intent-Lab/VisionClaw). The project is a clean-room implementation: no VisionClaw application source has been copied. See [NOTICE](NOTICE) and [the licensing decision](docs/decisions/0001-clean-room-and-license.md).

New Meta Gunu code is licensed under MIT. Meta SDKs and third-party services retain their own terms. Meta Gunu is independent and is not an official Meta or OpenAI product.
