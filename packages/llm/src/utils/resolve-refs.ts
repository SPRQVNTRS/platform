// Resolves JSON Schema $ref/$defs by inlining all references and converts
// anyOf nullable patterns ({ anyOf: [T, { type: "null" }] }) for Gemini compatibility.

const MAX_INLINE_DEPTH = 50;

export function resolveRefs(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const defs = ((schema.$defs ?? schema.definitions ?? {}) as Record<
    string,
    unknown
  >);

  function inline(node: unknown, depth: number): unknown {
    if (depth > MAX_INLINE_DEPTH) {
      throw new Error(
        `resolveRefs: exceeded max inline depth of ${MAX_INLINE_DEPTH} — possible circular $ref`,
      );
    }

    if (Array.isArray(node)) {
      return node.map((item) => inline(item, depth + 1));
    }

    if (node === null || typeof node !== "object") {
      return node;
    }

    const obj = node as Record<string, unknown>;

    // Resolve $ref
    if (typeof obj.$ref === "string") {
      const refPath = obj.$ref;
      const match = refPath.match(/^#\/(\$defs|definitions)\/(.+)$/);
      if (!match) {
        return obj;
      }
      const defName = match[2]!;
      const definition = defs[defName];
      if (definition === undefined) {
        throw new Error(`resolveRefs: missing definition for "${defName}"`);
      }
      return inline(structuredClone(definition), depth + 1);
    }

    // Convert anyOf nullable pattern: { anyOf: [T, { type: "null" }] }
    if (Array.isArray(obj.anyOf) && obj.anyOf.length === 2) {
      const [first, second] = obj.anyOf as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];

      let realType: Record<string, unknown> | null = null;

      if (
        second !== null &&
        typeof second === "object" &&
        second.type === "null"
      ) {
        realType = first;
      } else if (
        first !== null &&
        typeof first === "object" &&
        first.type === "null"
      ) {
        realType = second;
      }

      if (realType !== null) {
        const { anyOf: _, ...rest } = obj;
        const resolved = inline(realType, depth + 1) as Record<
          string,
          unknown
        >;
        return { ...rest, ...resolved, nullable: true };
      }
    }

    // Recurse into all properties
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = inline(value, depth + 1);
    }
    return result;
  }

  const resolved = inline(schema, 0) as Record<string, unknown>;
  delete resolved.$defs;
  delete resolved.definitions;
  return resolved;
}
