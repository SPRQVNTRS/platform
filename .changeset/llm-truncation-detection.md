---
"@sprqvntrs/llm": patch
---

fix(llm): detect output truncation via finish_reason before JSON parsing

OpenRouterClient.createStructuredResponse now checks finish_reason === 'length' in both streaming and non-streaming paths, throwing a descriptive LlmOutputTruncatedError instead of a confusing SyntaxError from truncated JSON. Adds finishReason field to StreamChunk interface.
