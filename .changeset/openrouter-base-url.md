---
"@sprqvntrs/llm": minor
---

feat(llm): add a `baseUrl` option to the OpenRouter client so one stack can use both the global host (`https://openrouter.ai/api/v1`) and the EU in-region host (`https://eu.openrouter.ai/api/v1`). The value comes from the `baseUrl` option, then the `OPENROUTER_BASE_URL` environment variable, then the global default. It fails closed: anything that is not an `https` URL on `openrouter.ai` or a subdomain with the path `/api/v1` throws at construction. The new `resolveOpenRouterBaseUrl()` validator is exported so apps can check their configuration at boot, and the client exposes the resolved value as a read-only `baseUrl`. OpenAI and Anthropic clients are unchanged.
