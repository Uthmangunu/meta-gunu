# ADR-0002: fail-closed audio routing

Status: accepted, 2026-09-18.

The listening state machine treats user intent and the current physical input route as two independent requirements. Glasses mode requires an explicit start plus an exact selected-glasses identifier. Phone mode requires an explicit phone action plus the built-in route. A route mismatch transitions to Interrupted and stops capture; it never changes mode automatically.

This design costs some convenience during Bluetooth instability, but it makes the privacy promise mechanically testable and prevents a system route fallback from activating the phone microphone.
