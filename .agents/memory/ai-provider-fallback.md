---
name: AI provider fallback
description: How student chat stays useful when hosted AI access is unavailable.
---

Study Spark treats public source retrieval as a first-class fallback: when the configured model provider is missing, out of credits, or returns an error, the chat should return a transparent source-first study response rather than a dead error state.

**Why:** The workspace's managed AI setup may require an upgrade, and a user-provided provider key may have no remaining quota; student research should still work in that situation.

**How to apply:** Keep research retrieval independent from model calls, never claim a generated explanation when the model was unavailable, and preserve the same answer/source shape so the UI remains stable.