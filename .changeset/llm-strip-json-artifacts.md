---
"@sprqvntrs/llm": minor
---

feat(llm): add stripJsonArtifacts() utility and wire into OpenRouterClient.createResponse

Promotes the delphi-local JSON artifact sanitizer into the shared @sprqvntrs/llm package.
stripJsonArtifacts() strips 8 categories of LLM output artifacts (markdown fences, JSON
fragments, serialization noise, PMID placeholders, structural labels, INVALID_* tokens,
meta-commentary, and XML-like closing tags) from prose responses. Wired into
OpenRouterClient.createResponse() by default; opt out per call via skipArtifactStripping: true.
createStructuredResponse() is unaffected. SanitizationResult type exported for caller telemetry.
