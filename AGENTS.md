# Agent operating guide

Before changing anything:

1. Read `constitution.md` completely.
2. Read the documentation relevant to the subsystem you will touch.
3. Inspect `git status`, the current branch, recent commits, and existing tests.
4. Verify external API assumptions against primary documentation.

## Non-negotiable rules

- Preserve every listening invariant in `constitution.md`. Never add automatic phone-microphone fallback.
- Do not describe hardware, provider, or laptop behavior as implemented until a reproducible test verifies it.
- Keep voice, audio routing, wearable capture, memory, and tasks behind interfaces.
- Never store raw audio or camera images by default.
- Never auto-approve consequential actions or Codex permission requests.
- Use stable task IDs and idempotency keys across retries.
- Do not import VisionClaw source until its terms have been reviewed and documented. Preserve attribution.
- Keep secrets out of source control and logs.

## Change workflow

- Use a focused `codex/<feature>` branch.
- Add or update tests for changed behavior.
- Update user-facing and operator documentation when behavior changes.
- Every pull request that changes code must update `constitution.md` under implementation status, test evidence, or next steps.
- Run `npm test`, `npm run typecheck`, and the relevant Swift tests before requesting review.
- Review the diff for accidental microphone fallback, persisted media, misleading claims, credentials, and unrelated edits.

When hardware evidence is missing, fail closed and record the gap in `docs/hardware-feasibility.md`.
