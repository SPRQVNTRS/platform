# LLM Client Tests

This directory contains manual integration tests for the LLM clients. These tests make actual API calls to verify that the clients are working correctly.

## Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp tests/.env.example tests/.env
   ```

2. Fill in your API keys in `tests/.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   OPENAI_API_KEY=sk-...
   OPENROUTER_API_KEY=sk-or-...
   ```

## Running Tests

Run individual test files using tsx:

```bash
# Test Anthropic client
pnpm tsx tests/anthropic-client.test.ts

# Test OpenRouter client
pnpm tsx tests/openrouter-client.test.ts

# Test OpenAI client
pnpm tsx tests/openai-client.test.ts
```

Or use the npm scripts:

```bash
# Run all tests
pnpm test

# Run specific client tests
pnpm test:anthropic
pnpm test:openrouter
pnpm test:openai
```

## What These Tests Cover

Each client has 2 simple tests to verify basic functionality:

### AnthropicClient
- Basic structured response
- Structured response with reasoning effort (tests thinking mode)

### OpenRouterClient
- Basic structured response
- Structured output with arrays

### OpenAIClient
- Basic structured response
- Structured output with nested objects

## Notes

- These are **integration tests** that make real API calls and will consume API credits
- Tests are kept minimal (2 calls per client) to avoid excessive API usage
- Tests use debug mode to provide detailed logging
- Execution time logging is enabled to monitor performance
