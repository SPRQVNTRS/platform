import { z } from 'zod/v4';

/**
 * Recursively walks parsed JSON alongside a Zod v4 schema and replaces
 * the literal string `"null"` with actual `null` wherever the schema
 * declares `.nullable()`.
 *
 * Gemini models return the literal string `"null"` instead of JSON `null`
 * for nullable fields in structured output. This function normalises
 * the parsed data **in-place** before Zod validation so that `.nullable()`
 * fields validate correctly.
 *
 * Because we access Zod v4 internals (`_zod.def`), `any` casts are
 * unavoidable for the schema introspection paths.
 */
export function normalizeNullStrings(data: unknown, schema: z.ZodType): unknown {
  const def = (schema as any)._zod.def;
  const type: string = def.type;

  switch (type) {
    case 'nullable': {
      if (data === 'null') {
        return null;
      }
      return normalizeNullStrings(data, def.innerType);
    }

    case 'optional':
    case 'default': {
      return normalizeNullStrings(data, def.innerType);
    }

    case 'object': {
      if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        return data;
      }
      const shape: Record<string, z.ZodType> = def.shape;
      const record = data as Record<string, unknown>;
      for (const key of Object.keys(shape)) {
        if (key in record) {
          record[key] = normalizeNullStrings(record[key], shape[key]!);
        }
      }
      return data;
    }

    case 'array': {
      if (!Array.isArray(data)) {
        return data;
      }
      const element: z.ZodType = def.element;
      for (let i = 0; i < data.length; i++) {
        data[i] = normalizeNullStrings(data[i], element);
      }
      return data;
    }

    case 'union': {
      const options: readonly z.ZodType[] = def.options;
      // Find a nullable (or nullable-containing) option and recurse with it.
      for (const option of options) {
        const optDef = (option as any)._zod.def;
        if (optDef.type === 'nullable') {
          return normalizeNullStrings(data, option);
        }
      }
      // No nullable option found — try each option for structural recursion
      for (const option of options) {
        const optDef = (option as any)._zod.def;
        if (optDef.type === 'object' || optDef.type === 'array') {
          return normalizeNullStrings(data, option);
        }
      }
      return data;
    }

    case 'tuple': {
      if (!Array.isArray(data)) {
        return data;
      }
      const items: readonly z.ZodType[] = def.items;
      for (let i = 0; i < items.length && i < data.length; i++) {
        data[i] = normalizeNullStrings(data[i], items[i]!);
      }
      return data;
    }

    case 'record': {
      if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        return data;
      }
      const valueType: z.ZodType = def.valueType;
      const record = data as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        record[key] = normalizeNullStrings(record[key], valueType);
      }
      return data;
    }

    default:
      return data;
  }
}
