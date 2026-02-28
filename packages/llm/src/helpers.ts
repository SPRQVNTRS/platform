import { z } from 'zod/v4';
import type { LlmClientInterface } from './types/client-interface';

/**
 * Simple schema for language validation response
 */
const LanguageCheckSchema = z.object({
  isCorrectLanguage: z.boolean(),
});

/**
 * Checks if content is in the expected language using an LLM
 *
 * @param {Object} params - The parameters for checking language
 * @param {LlmClientInterface} params.llm - The LLM client to use for language detection
 * @param {string} params.content - The content to check
 * @param {string} params.expectedLanguage - The expected language of the content
 * @returns {Promise<boolean>} - Whether the content is in the expected language
 */
export async function isContentInLanguage({
  llm,
  content,
  expectedLanguage,
}: {
  llm: LlmClientInterface;
  content: string;
  expectedLanguage: string;
}): Promise<boolean> {
  try {
    const prompt = `
      <task>
        Determine if the following content is written in ${expectedLanguage} language.
      </task>

      <instructions>
        - Analyze the text and determine if it's written in ${expectedLanguage}
        - Return true if the content is in ${expectedLanguage}
        - Return false if the content is in any other language
        - Ignore small phrases or individual words that might be in other languages
        - Focus on the primary language of the text
      </instructions>

      <content>
        ${content}
      </content>
    `;

    const response = await llm.createStructuredResponse({
      prompt,
      schema: LanguageCheckSchema,
      reasoningEffort: 'low', // Language detection doesn't need high reasoning
    });

    return response.isCorrectLanguage;
  } catch (error) {
    console.error('Error checking language:', error);
    // In case of error, assume the language is correct to avoid blocking the flow
    return true;
  }
}

/**
 * Formats unstructured content into a structured format using an LLM
 *
 * This utility function takes unstructured content (typically from another LLM)
 * and formats it according to a specified Zod schema. This is useful when working
 * with LLMs that don't support structured outputs natively.
 *
 * @template T - The Zod schema type
 * @param {Object} params - The parameters for formatting content
 * @param {LlmClientInterface} params.llm - The LLM client to use for formatting
 * @param {string} params.unstructuredContent - The unstructured content to format
 * @param {T} params.schema - The Zod schema to validate against
 * @param {string} [params.additionalInstructions] - Optional additional instructions for the formatting
 * @returns {Promise<z.infer<T>>} - A promise that resolves to the structured content
 */
export async function formatContentToStructure<T extends z.ZodType>({
  llm,
  unstructuredContent,
  schema,
  additionalInstructions = '',
}: {
  llm: LlmClientInterface;
  unstructuredContent: string;
  schema: T;
  additionalInstructions?: string;
}): Promise<z.infer<T>> {
  const conversionPrompt = `
    This is the output of an AI model that is not able to respond in the format we need.
    Please convert the output to the format we need. If you encounter any errors, return false on the success property (if applicable).
    ${additionalInstructions ? `\n${additionalInstructions}` : ''}
    <output>
      ${JSON.stringify(unstructuredContent, null, 2)}
    </output>
  `;

  const completion = await llm.createStructuredResponse({
    prompt: conversionPrompt,
    schema: schema,
    reasoningEffort: 'low', // Formatting typically doesn't need high reasoning
  });

  return completion as z.infer<T>;
}

/**
 * Attempts to generate and format content with language validation
 *
 * This function orchestrates the process of generating content with one LLM,
 * checking if it's in the correct language, and formatting it with another LLM.
 *
 * @template T - The Zod schema type
 * @param {Object} params - The parameters for generating and formatting
 * @param {Function} params.generateContent - Function that generates the unstructured content
 * @param {LlmClientInterface} params.languageCheckLlm - The LLM client to use for language validation
 * @param {LlmClientInterface} params.formatterLlm - The LLM client to use for formatting
 * @param {string} params.expectedLanguage - The expected language of the output
 * @param {T} params.schema - The Zod schema to validate against
 * @param {number} [params.maxAttempts=3] - Maximum number of attempts to get correct language
 * @param {string} [params.additionalInstructions] - Optional additional instructions for formatting
 * @returns {Promise<z.infer<T>>} - A promise that resolves to the structured content
 */
export async function generateAndFormatWithLanguageCheck<T extends z.ZodType>({
  generateContent,
  languageCheckLlm,
  formatterLlm,
  expectedLanguage,
  schema,
  maxAttempts = 3,
  additionalInstructions,
}: {
  generateContent: () => Promise<string>;
  languageCheckLlm: LlmClientInterface;
  formatterLlm: LlmClientInterface;
  expectedLanguage: string;
  schema: T;
  maxAttempts?: number;
  additionalInstructions?: string;
}): Promise<z.infer<T> & { languageCorrect: boolean }> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;

    // Step 1: Generate content
    const unstructuredContent = await generateContent();

    // Step 2: Check if content is in the expected language
    const isLanguageCorrect = await isContentInLanguage({
      llm: languageCheckLlm,
      content: unstructuredContent,
      expectedLanguage,
    });

    // Step 3: Format the content regardless of language correctness
    const formattedContent = await formatContentToStructure({
      llm: formatterLlm,
      unstructuredContent,
      schema,
      additionalInstructions,
    });

    // Add language check result to the response
    const result = {
      ...(formattedContent as object),
      languageCorrect: isLanguageCorrect,
    } as z.infer<T> & { languageCorrect: boolean };

    // If language is correct, return immediately
    if (isLanguageCorrect) {
      return result;
    }

    // If we've reached max attempts, return the last result anyway
    if (attempts === maxAttempts) {
      console.warn(`Max attempts reached. Language still incorrect after ${maxAttempts} tries.`);
      return result;
    }

    console.info(`Incorrect language detected, retrying...`);
  }

  // This should never be reached due to the while loop conditions
  throw new Error('Unexpected end of content generation process');
}