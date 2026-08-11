/**
 * Tests for OpenRouter reasoning-effort transmission.
 *
 * Two guarantees, each asserted on BOTH request paths (streaming is the default
 * since `stream = true`, non-streaming is opt-in via `stream: false`):
 *
 *  1. Omitting `reasoningEffort` sends NO `reasoning` key at all. This is the
 *     regression guard for dropping the old `reasoningEffort = 'low'` default —
 *     the parameter used to be accepted and silently discarded, so transmitting
 *     a defaulted 'low' would change behaviour for every existing caller.
 *  2. Passing `'none'` sends `reasoning: { effort: 'none' }`, which is how a
 *     caller turns a reasoning model's thinking off.
 *
 * The private OpenRouter SDK instance is replaced with a fake whose `chat.send`
 * records the outgoing `chatRequest` (same stubbing approach as
 * openrouter-error-wrapping.test.ts).
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod/v4';
import { OpenRouterClient } from '../src/clients/openrouter-client';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Minimal shape of the private SDK instance the client calls into. */
interface FakeSdkClient {
  chat: { send: (args: { chatRequest: Record<string, unknown> }) => Promise<unknown> };
}

const TestSchema = z.object({ answer: z.string() });
const RESPONSE_JSON = '{"answer":"42"}';

/** Non-streaming SDK response shape the client reads. */
const nonStreamingResponse = {
  choices: [{ message: { content: RESPONSE_JSON }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

/** Streaming SDK response shape: an async iterable of delta chunks. */
async function* streamingResponse(): AsyncGenerator<unknown> {
  yield { choices: [{ delta: { content: RESPONSE_JSON } }] };
  yield {
    choices: [{ delta: {}, finish_reason: 'stop' }],
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  };
}

/**
 * Stubs the private SDK instance so `chat.send` records the outgoing request
 * and resolves with a shape appropriate to the requested mode.
 *
 * @returns A getter for the captured `chatRequest` payload.
 */
function captureChatRequest(client: OpenRouterClient): () => Record<string, unknown> {
  const captured: Record<string, unknown>[] = [];

  (client as unknown as { client: FakeSdkClient }).client = {
    chat: {
      send: async ({ chatRequest }) => {
        captured.push(chatRequest);
        return chatRequest.stream === true ? streamingResponse() : nonStreamingResponse;
      },
    },
  };

  return () => {
    const [request] = captured;
    if (!request) {
      throw new Error('chat.send was never called');
    }
    return request;
  };
}

function makeClient(): OpenRouterClient {
  return new OpenRouterClient({ apiKey: 'test-key', model: 'openai/gpt-4o' });
}

// ── reasoningEffort omitted → no `reasoning` key ─────────────────────────────

describe('createStructuredResponse — reasoningEffort omitted', () => {
  it('sends no reasoning field on the streaming path (the default path)', async () => {
    const client = makeClient();
    const getRequest = captureChatRequest(client);

    await client.createStructuredResponse({
      prompt: 'What is the answer?',
      schema: TestSchema,
      maxAttempts: 1,
    });

    const request = getRequest();
    expect(request.stream).toBe(true);
    expect(request).not.toHaveProperty('reasoning');
  });

  it('sends no reasoning field on the non-streaming path', async () => {
    const client = makeClient();
    const getRequest = captureChatRequest(client);

    await client.createStructuredResponse({
      prompt: 'What is the answer?',
      schema: TestSchema,
      stream: false,
      maxAttempts: 1,
    });

    const request = getRequest();
    expect(request.stream).toBe(false);
    expect(request).not.toHaveProperty('reasoning');
  });
});

// ── reasoningEffort 'none' → reasoning.effort === 'none' ─────────────────────

describe("createStructuredResponse — reasoningEffort 'none'", () => {
  it("sends reasoning: { effort: 'none' } on the streaming path", async () => {
    const client = makeClient();
    const getRequest = captureChatRequest(client);

    await client.createStructuredResponse({
      prompt: 'What is the answer?',
      schema: TestSchema,
      reasoningEffort: 'none',
      maxAttempts: 1,
    });

    const request = getRequest();
    expect(request.stream).toBe(true);
    expect(request.reasoning).toEqual({ effort: 'none' });
  });

  it("sends reasoning: { effort: 'none' } on the non-streaming path", async () => {
    const client = makeClient();
    const getRequest = captureChatRequest(client);

    await client.createStructuredResponse({
      prompt: 'What is the answer?',
      schema: TestSchema,
      reasoningEffort: 'none',
      stream: false,
      maxAttempts: 1,
    });

    const request = getRequest();
    expect(request.stream).toBe(false);
    expect(request.reasoning).toEqual({ effort: 'none' });
  });
});

// ── other effort levels still transmit ───────────────────────────────────────

describe('createStructuredResponse — explicit effort levels', () => {
  it.each(['low', 'medium', 'high'] as const)(
    "sends reasoning: { effort: '%s' } on the streaming path",
    async (effort) => {
      const client = makeClient();
      const getRequest = captureChatRequest(client);

      await client.createStructuredResponse({
        prompt: 'What is the answer?',
        schema: TestSchema,
        reasoningEffort: effort,
        maxAttempts: 1,
      });

      expect(getRequest().reasoning).toEqual({ effort });
    },
  );
});
