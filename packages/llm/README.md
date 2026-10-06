# @sprqvntrs/llm

A unified LLM client library for seamless integration with multiple AI providers (OpenAI and Anthropic). This package provides a consistent API across different LLM providers with built-in support for structured outputs, batch processing, embeddings, and web search.

## Features

- **Unified Interface**: Single consistent API for both OpenAI and Anthropic
- **Structured Outputs**: Generate responses that match Zod schemas with automatic validation
- **Multi-Provider Support**: Seamlessly switch between OpenAI and Anthropic
- **Web Search Integration**: Enable web search capabilities for real-time information
- **Batch Processing**: Process multiple items in parallel with configurable batch sizes
- **Embeddings**: Generate embeddings for semantic search and similarity tasks
- **Language Validation**: Check and validate content language
- **Retry Logic**: Built-in retry mechanisms with configurable attempts
- **Type Safety**: Full TypeScript support with provider-specific model type inference

## Installation

```bash
npm install @sprqvntrs/llm
```

## Quick Start

### Basic Usage

```typescript
import { LLM } from '@sprqvntrs/llm';
import { z } from 'zod';

// Get a client for your chosen provider
const client = LLM.getClient('openai', 'gpt-4o');

// Validate configuration
client.validateConfiguration(); // throws if not configured

// Create a structured response
const schema = z.object({
  summary: z.string(),
  sentiment: z.enum(['positive', 'negative', 'neutral']),
});

const result = await client.createStructuredResponse({
  prompt: 'Analyze this text and provide a summary with sentiment.',
  schema,
});

console.log(result.summary);     // Structured output
console.log(result.sentiment);   // Type-safe enum
```

### Environment Setup

Set up your API keys as environment variables:

```bash
# For OpenAI
export OPENAI_API_KEY="sk-..."

# For Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# For Anthropic with structured output support (optional)
# Anthropic will use OpenAI for formatting if available
export OPENAI_API_KEY="sk-..."
```

Alternatively, pass API keys directly:

```typescript
const client = LLM.getClient('openai', 'gpt-4o', {
  apiKey: 'sk-your-key-here',
});
```

## Core API

### LLM.getClient()

Factory method to create a client for a specific provider.

```typescript
const client = LLM.getClient(provider, model, options?);
```

**Parameters:**
- `provider: 'openai' | 'anthropic'` - The LLM provider
- `model: string` - The model identifier
- `options?: LlmClientOptions` - Optional configuration

**Options:**
```typescript
{
  apiKey?: string;                  // Override environment API key
  debug?: boolean;                  // Enable debug logging
  useReasoningMode?: boolean;       // Enable reasoning endpoints (OpenAI only)
  openaiApiKey?: string;            // OpenAI key for Anthropic formatting
  baseUrl?: string;                 // OpenRouter endpoint (OpenRouter only), see "OpenRouter endpoints"
}
```

**Returns:** `LlmClientInterface` - A client implementing the unified interface

**Example:**
```typescript
// Using environment variables
const client1 = LLM.getClient('openai', 'gpt-4o');

// Override with explicit keys
const client2 = LLM.getClient('anthropic', 'claude-sonnet-4-5-20250929', {
  apiKey: process.env.ANTHROPIC_KEY,
  openaiApiKey: process.env.OPENAI_KEY,
});

// Enable debug mode
const client3 = LLM.getClient('openai', 'gpt-4o', { debug: true });
```

### createStructuredResponse()

Generate a response that conforms to a Zod schema with automatic validation and retry logic.

```typescript
const result = await client.createStructuredResponse({
  prompt: string;
  schema: ZodSchema;
  formatGuidance?: string;
  reasoningEffort?: 'low' | 'medium' | 'high';
  maxAttempts?: number;
  logExecutionTime?: boolean;
  useWebSearch?: boolean;
});
```

**Parameters:**
- `prompt` - The prompt to send to the model
- `schema` - A Zod schema defining the expected response structure
- `formatGuidance` - Optional guidance for formatting the response
- `reasoningEffort` - Level of reasoning (OpenAI o1 models only)
  - `'low'` - Minimal reasoning
  - `'medium'` - Standard reasoning
  - `'high'` - Extended reasoning
- `maxAttempts` - Retry attempts if validation fails (default: 1)
- `logExecutionTime` - Log warnings for slow executions
- `useWebSearch` - Enable web search for this request

**Returns:** Promise resolving to typed object matching the schema

**Example:**
```typescript
const schema = z.object({
  title: z.string(),
  sections: z.array(z.object({
    heading: z.string(),
    content: z.string(),
  })),
  metadata: z.object({
    wordCount: z.number(),
    estimatedReadTime: z.number(),
  }),
});

const article = await client.createStructuredResponse({
  prompt: 'Create a blog post about TypeScript best practices',
  schema,
  formatGuidance: 'Ensure all sections are well-structured and informative',
  maxAttempts: 3,  // Retry up to 3 times if validation fails
});

console.log(article.title);
console.log(article.sections[0].heading);
console.log(article.metadata.wordCount);
```

### processBatchWithLLM()

Process a batch of items in parallel, automatically chunking into smaller batches.

```typescript
const results = await client.processBatchWithLLM(
  items,
  processFn,
  batchSize?
);
```

**Parameters:**
- `items: T[]` - Array of items to process
- `processFn: (batch: T[]) => Promise<R[]>` - Function to process each batch
- `batchSize?: number` - Items per batch (default: provider-specific)

**Returns:** Promise resolving to flattened array of results

**Example:**
```typescript
const articles = ['article1', 'article2', 'article3', 'article4'];

const summaries = await client.processBatchWithLLM(
  articles,
  async (batch) => {
    // This function is called with [2 items] at a time
    return Promise.all(batch.map(article =>
      client.createStructuredResponse({
        prompt: `Summarize: ${article}`,
        schema: z.object({ summary: z.string() }),
      })
    ));
  },
  2,  // Process 2 items at a time
);

console.log(summaries); // All summaries processed efficiently
```

### generateEmbedding()

Generate a vector embedding for semantic search and similarity tasks.

```typescript
const embedding = await client.generateEmbedding(text);
```

**Parameters:**
- `text: string` - The text to embed

**Returns:** Promise resolving to numeric array (vector)

**Example:**
```typescript
const embedding = await client.generateEmbedding(
  'The quick brown fox jumps over the lazy dog'
);

console.log(embedding.length);  // 3072 for text-embedding-3-large
// Store in vector database for similarity search
```

### validateConfiguration()

Check if the client is properly configured with valid credentials.

```typescript
try {
  client.validateConfiguration();
  console.log('Client is ready to use');
} catch (error) {
  console.error('Configuration error:', error.message);
}
```

## OpenRouter endpoints

The OpenRouter client can talk to two hosts:

| Host | Base URL | Use |
|------|----------|-----|
| Global (default) | `https://openrouter.ai/api/v1` | All models |
| EU in-region | `https://eu.openrouter.ai/api/v1` | OpenRouter Business. Fails closed and routes only to EU endpoints. |

Pick the host with the `baseUrl` option or the `OPENROUTER_BASE_URL` environment variable.
The order is: the `baseUrl` option, then `OPENROUTER_BASE_URL`, then the global default.

```typescript
import { LLM, OpenRouterClient, EU_OPENROUTER_BASE_URL } from '@sprqvntrs/llm';

// Through the factory (or set OPENROUTER_BASE_URL=https://eu.openrouter.ai/api/v1)
const client = LLM.getClient('openrouter', 'openai/gpt-4o-mini', {
  baseUrl: EU_OPENROUTER_BASE_URL,
});

// Or directly. The resolved value is exposed read-only, for logging.
const direct = new OpenRouterClient({ apiKey, model: 'openai/gpt-4o-mini', baseUrl: EU_OPENROUTER_BASE_URL });
direct.baseUrl; // 'https://eu.openrouter.ai/api/v1'
```

The OpenAI and Anthropic clients ignore `baseUrl`.

### Validation

The value fails closed. The client throws at construction, and the message names the offending
value (never the API key), when the value is not all of these:

- a URL with the `https:` protocol
- a host that is exactly `openrouter.ai` or ends with `.openrouter.ai`
- free of credentials, a port, a query and a fragment
- on the path `/api/v1` (one trailing slash is accepted and stripped)

An empty string is also rejected. It never falls back to the global host.

Apps can check their configuration at boot with the same validator:

```typescript
import { resolveOpenRouterBaseUrl } from '@sprqvntrs/llm';

// Throws on a bad value. Returns the normalised URL otherwise.
const baseUrl = resolveOpenRouterBaseUrl(config.openrouterBaseUrl); // falls back to process.env, then the default
```

Signature: `resolveOpenRouterBaseUrl(explicit?: string, env?: NodeJS.ProcessEnv): string`.

### What changes on the EU host

- **Fewer models.** The EU host lacks some models. For example there is no Gemini 3.7 or 3.8 Flash,
  and no preview models. `openai/gpt-5.4-mini` has zero data retention (ZDR) endpoints only on Azure US.
- **Price.** The EU host carries about a 10 percent surcharge.
- **Missing model means HTTP 404.** A model with no endpoint on the chosen host fails with
  HTTP 404 and the message "no endpoints available". Retrying never helps. Treat it as a
  **configuration error** (wrong model for this host), not as a retryable error. Check the model
  list for the host before you switch.

## Helper Functions

### isContentInLanguage()

Validate that content is written in the expected language.

```typescript
import { isContentInLanguage } from '@sprqvntrs/llm';

const isEnglish = await isContentInLanguage({
  llm: client,
  content: 'Hello, how are you?',
  expectedLanguage: 'English',
});

console.log(isEnglish); // true
```

### formatContentToStructure()

Convert unstructured content (from an LLM or other source) into a structured format.

```typescript
import { formatContentToStructure } from '@sprqvntrs/llm';

const schema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
});

const structured = await formatContentToStructure({
  llm: client,
  unstructuredContent: 'John is 30 years old and his email is john@example.com',
  schema,
  additionalInstructions: 'Ensure email format is valid',
});

console.log(structured.name);   // "John"
console.log(structured.age);    // 30
console.log(structured.email);  // "john@example.com"
```

### generateAndFormatWithLanguageCheck()

Orchestrate content generation with language validation and formatting in a single call.

```typescript
import { generateAndFormatWithLanguageCheck } from '@sprqvntrs/llm';

const schema = z.object({
  response: z.string(),
  isValid: z.boolean(),
});

const result = await generateAndFormatWithLanguageCheck({
  generateContent: async () => {
    // Function that generates the initial content
    const completion = await client.createStructuredResponse({
      prompt: 'Generate a story about adventure',
      schema: z.object({ text: z.string() }),
    });
    return completion.text;
  },
  languageCheckLlm: client,
  formatterLlm: client,
  expectedLanguage: 'English',
  schema,
  maxAttempts: 3,
  additionalInstructions: 'Ensure proper formatting',
});

console.log(result.response);        // Formatted content
console.log(result.languageCorrect); // Language validation result
```

## Model Types and Configuration

### Available Models

The package includes pre-configured default models for common tasks:

```typescript
import { DEFAULT_MODELS } from '@sprqvntrs/llm';

// Access default configurations
DEFAULT_MODELS.OPENAI_DEFAULT;          // gpt-5-mini-2025-08-07
DEFAULT_MODELS.ANTHROPIC_DEFAULT;       // claude-sonnet-4-5-20250929
DEFAULT_MODELS.STRUCTURED_FORMATTER;    // gpt-5-mini-2025-08-07 (for Anthropic formatting)
DEFAULT_MODELS.LANGUAGE_DETECTOR;       // gpt-5-nano-2025-08-07
```

### Type-Safe Model Selection

The package provides TypeScript types that enable IDE autocomplete for provider-specific models:

```typescript
import type { ModelConfig, OpenAIModel, AnthropicModel } from '@sprqvntrs/llm';

// Type-safe configuration with autocomplete
const openaiConfig: ModelConfig<'openai'> = {
  provider: 'openai',
  model: 'gpt-4o', // Autocomplete shows only OpenAI models
};

const anthropicConfig: ModelConfig<'anthropic'> = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-5-20250929', // Autocomplete shows only Anthropic models
};
```

### Web Search Configuration

Enable real-time web search for responses:

```typescript
import { WEB_SEARCH_TOOLS } from '@sprqvntrs/llm';

// Use web search in structured responses
const result = await client.createStructuredResponse({
  prompt: 'What are the latest developments in AI?',
  schema: z.object({ summary: z.string() }),
  useWebSearch: true,
});
```

## Advanced Examples

### Multi-Step Processing Pipeline

```typescript
import { LLM, formatContentToStructure } from '@sprqvntrs/llm';
import { z } from 'zod';

const client = LLM.getClient('anthropic', 'claude-sonnet-4-5-20250929');

// Step 1: Generate unstructured content
const generationResult = await client.createStructuredResponse({
  prompt: 'Write a technical analysis',
  schema: z.object({ analysis: z.string() }),
});

// Step 2: Structure and validate the content
const schema = z.object({
  title: z.string(),
  keyPoints: z.array(z.string()),
  conclusion: z.string(),
});

const structured = await formatContentToStructure({
  llm: client,
  unstructuredContent: generationResult.analysis,
  schema,
});

console.log(structured.keyPoints);
```

### Handling Provider-Specific Features

```typescript
// Use reasoning effort (OpenAI o1 models only)
const result = await client.createStructuredResponse({
  prompt: 'Solve this complex problem...',
  schema: z.object({ solution: z.string() }),
  reasoningEffort: 'high',  // Only works with OpenAI
});

// Switch to Anthropic with web search
const anthropic = LLM.getClient('anthropic', 'claude-opus-4-1-20250805');
const webResult = await anthropic.createStructuredResponse({
  prompt: 'What is the current stock price of...?',
  schema: z.object({ price: z.number() }),
  useWebSearch: true,
});
```

### Error Handling

```typescript
try {
  const client = LLM.getClient('openai', 'gpt-4o');

  const result = await client.createStructuredResponse({
    prompt: 'Generate data',
    schema: z.object({ data: z.string() }),
    maxAttempts: 3,  // Will retry if validation fails
  });

  console.log('Success:', result);
} catch (error) {
  if (error.message.includes('API key')) {
    console.error('Authentication failed');
  } else if (error instanceof z.ZodError) {
    console.error('Validation error:', error.issues);
  } else {
    console.error('Request failed:', error.message);
  }
}
```

## Reasoning Effort Levels

The `reasoningEffort` parameter controls how much computational effort the model uses. This is currently supported by OpenAI's reasoning models:

| Level | Use Case | Cost | Latency |
|-------|----------|------|---------|
| `'low'` | Simple tasks, quick responses | Lower | Fast |
| `'medium'` | Balanced reasoning for complex problems | Medium | Medium |
| `'high'` | Complex problem-solving requiring deep reasoning | Higher | Slower |

**Note:** Anthropic models ignore this parameter as they don't support explicit reasoning effort control.

## Anthropic-Specific Behavior

When using an Anthropic client, the package can automatically format structured outputs using OpenAI if an OpenAI API key is available:

1. **With OpenAI Key Available** (Recommended):
   - Anthropic generates the response
   - OpenAI validates and formats it according to the schema
   - Highest reliability for structured outputs

2. **Without OpenAI Key**:
   - Anthropic attempts direct JSON generation
   - Less reliable but still functional
   - Falls back gracefully with warnings

```typescript
// Best practice: Provide both keys for optimal formatting
const client = LLM.getClient('anthropic', 'claude-sonnet-4-5-20250929', {
  apiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
});
```

## Batch Processing Strategy

The `processBatchWithLLM()` method is optimized for:
- Parallel processing of independent items
- Automatic batching to respect API rate limits
- Memory-efficient chunking of large datasets

```typescript
// Process 1000 items with batch size of 10
const results = await client.processBatchWithLLM(
  largeArray,
  async (batch) => {
    return Promise.all(
      batch.map(item =>
        client.createStructuredResponse({ /* ... */ })
      )
    );
  },
  10  // Process 10 items at a time
);
```

## Caching and Memoization

For repeated requests with identical prompts, consider caching:

```typescript
const cache = new Map<string, any>();

async function cachedRequest(prompt: string) {
  if (cache.has(prompt)) {
    return cache.get(prompt);
  }

  const result = await client.createStructuredResponse({
    prompt,
    schema: z.object({ /* ... */ }),
  });

  cache.set(prompt, result);
  return result;
}
```

## Troubleshooting

### "API key is not set" Error

```typescript
// Solution 1: Set environment variables
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."

// Solution 2: Pass keys explicitly
const client = LLM.getClient('openai', 'gpt-4o', {
  apiKey: 'sk-your-key',
});
```

### Schema Validation Errors

```typescript
// Enable retries to handle temporary validation issues
const result = await client.createStructuredResponse({
  prompt: 'Your prompt',
  schema: yourSchema,
  maxAttempts: 3,  // Retry up to 3 times
});

// Or use formatContentToStructure for manual control
const formatted = await formatContentToStructure({
  llm: client,
  unstructuredContent: rawContent,
  schema: yourSchema,
});
```

### Slow Responses

```typescript
// Monitor execution time
const result = await client.createStructuredResponse({
  prompt: 'Your prompt',
  schema: yourSchema,
  logExecutionTime: true,  // Log warnings for slow requests
  reasoningEffort: 'low',   // Use lower reasoning effort if possible
});
```

## Performance Tips

1. **Batch similar requests** using `processBatchWithLLM()`
2. **Use appropriate reasoning effort** - higher levels are slower but solve harder problems
3. **Enable web search sparingly** - it adds latency for real-time information
4. **Cache responses** for repeated identical prompts
5. **Use smaller models** (gpt-4o-mini, claude-haiku) for simple tasks
6. **Set reasonable maxAttempts** - balance reliability with cost

## API Reference

See [LlmClientInterface](src/types/client-interface.ts) for complete interface documentation.

## Raw TypeScript

This package ships raw TypeScript (`main` and `types` point at `index.ts`), so a Vite
consumer (Vite, React Router, Remix) must add the scope to `ssr.noExternal`:
`ssr: { noExternal: [/^@sprqvntrs\//] }`.

## License

MIT
