---
name: Groq study provider
description: The durable provider and failure-handling rule for Study Spark's student chat.
---

Study Spark's student chat uses Groq's OpenAI-compatible API from the server. The model is discovered from Groq's active models endpoint unless `GROQ_MODEL` explicitly selects an available model. Provider failures must never become fabricated academic answers; preserve independent public-source results and show a clear provider status instead.

**Why:** The student experience needs a real tutoring model for accurate explanations, while research should remain useful and honest when the model is unavailable.

**How to apply:** Keep `GROQ_API_KEY` server-side, avoid frontend provider calls, validate configured model IDs against Groq's live model list, and keep source retrieval independent from completion requests.