# Meta Gunu

A conversational companion for Meta glasses, connected to Codex on your computer.

Repository slug: `meta-gunu`.

## Product direction

- One ongoing conversation: talk naturally, ask questions, and work with Codex without switching between chat and coding modes.
- Codex runs on the connected laptop and uses the selected project's context and tools.
- The camera stays off by default. An explicit request such as “look at this” triggers a bounded capture, then releases the camera. Do not leave a stream running merely to discard its frames.
- Do not save camera images by default.
- Redesign the mobile interface around conversation, connection status, and requested visual context.
- Support remote access while the computer is awake and reachable.
- Speech input and playback require an audio implementation; the choice of speech provider is still to be determined. Do not assume Codex alone supplies realtime audio.
- Continuity with existing desktop tasks and personal memory must be verified; do not claim automatic access to ChatGPT saved memories.

## Status

Project initialized for development. No working application or glasses integration has been implemented here yet.

## Attribution and licensing

This project is planned as a separately named derivative of [VisionClaw](https://github.com/Uthmangunu/VisionClaw), whose upstream project is [Intent-Lab/VisionClaw](https://github.com/Intent-Lab/VisionClaw).

The local reference checkout is at commit `4472c8ec4ab1ee5b42b2d0437146e72cbfbccc24`. No upstream application source has been copied into this directory yet. Preserve applicable attribution, copyright notices, and license terms when incorporating upstream material.

The intention is to publish the project for community use. Licensing for new contributions and any inherited source remains to be resolved before publication; this document does not relicense VisionClaw or Meta's SDK.

Meta Gunu is an independent project and is not an official Meta or OpenAI product.
