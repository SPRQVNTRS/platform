import assert from 'node:assert';
import { resolveRefs } from '../src/utils/resolve-refs.js';

/**
 * Test script for resolveRefs
 *
 * Run with: pnpm tsx tests/resolve-refs.test.ts
 */

function testSimpleRefResolution() {
  const input = {
    type: 'object',
    properties: {
      name: { $ref: '#/$defs/Name' },
    },
    $defs: {
      Name: { type: 'string', minLength: 1 },
    },
  };

  const result = resolveRefs(input);

  const expected = {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1 },
    },
  };

  assert.deepStrictEqual(result, expected);
  console.log('  testSimpleRefResolution');
}

function testMultipleRefsToSameDefinition() {
  const input = {
    type: 'object',
    properties: {
      firstName: { $ref: '#/$defs/Name' },
      lastName: { $ref: '#/$defs/Name' },
    },
    $defs: {
      Name: { type: 'string', maxLength: 100 },
    },
  };

  const result = resolveRefs(input);

  const expected = {
    type: 'object',
    properties: {
      firstName: { type: 'string', maxLength: 100 },
      lastName: { type: 'string', maxLength: 100 },
    },
  };

  assert.deepStrictEqual(result, expected);

  // Verify they are independent copies (not the same object reference)
  const firstName = (result.properties as Record<string, unknown>).firstName;
  const lastName = (result.properties as Record<string, unknown>).lastName;
  assert.notStrictEqual(firstName, lastName, 'Inlined refs should be independent copies');

  console.log('  testMultipleRefsToSameDefinition');
}

function testNestedRefs() {
  const input = {
    type: 'object',
    properties: {
      address: { $ref: '#/$defs/Address' },
    },
    $defs: {
      Address: {
        type: 'object',
        properties: {
          city: { type: 'string' },
          country: { $ref: '#/$defs/Country' },
        },
      },
      Country: { type: 'string', enum: ['US', 'CA', 'UK'] },
    },
  };

  const result = resolveRefs(input);

  const expected = {
    type: 'object',
    properties: {
      address: {
        type: 'object',
        properties: {
          city: { type: 'string' },
          country: { type: 'string', enum: ['US', 'CA', 'UK'] },
        },
      },
    },
  };

  assert.deepStrictEqual(result, expected);
  console.log('  testNestedRefs');
}

function testArrayItemsWithRef() {
  const input = {
    type: 'object',
    properties: {
      tags: {
        type: 'array',
        items: { $ref: '#/$defs/Tag' },
      },
    },
    $defs: {
      Tag: { type: 'string', minLength: 1 },
    },
  };

  const result = resolveRefs(input);

  const expected = {
    type: 'object',
    properties: {
      tags: {
        type: 'array',
        items: { type: 'string', minLength: 1 },
      },
    },
  };

  assert.deepStrictEqual(result, expected);
  console.log('  testArrayItemsWithRef');
}

function testNoDefsPassthrough() {
  const input = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' },
    },
  };

  const result = resolveRefs(input);

  const expected = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' },
    },
  };

  assert.deepStrictEqual(result, expected);
  console.log('  testNoDefsPassthrough');
}

function testAnyOfNullableConversion() {
  const input = {
    type: 'object',
    properties: {
      nickname: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
      },
    },
  };

  const result = resolveRefs(input);

  const expected = {
    type: 'object',
    properties: {
      nickname: { type: 'string', nullable: true },
    },
  };

  assert.deepStrictEqual(result, expected);
  console.log('  testAnyOfNullableConversion');
}

function testAnyOfNullableReversedOrder() {
  const input = {
    type: 'object',
    properties: {
      nickname: {
        anyOf: [{ type: 'null' }, { type: 'string', maxLength: 50 }],
      },
    },
  };

  const result = resolveRefs(input);

  const expected = {
    type: 'object',
    properties: {
      nickname: { type: 'string', maxLength: 50, nullable: true },
    },
  };

  assert.deepStrictEqual(result, expected);
  console.log('  testAnyOfNullableReversedOrder');
}

function testAnyOfWithRefInside() {
  const input = {
    type: 'object',
    properties: {
      address: {
        anyOf: [{ $ref: '#/$defs/Address' }, { type: 'null' }],
      },
    },
    $defs: {
      Address: {
        type: 'object',
        properties: {
          street: { type: 'string' },
        },
      },
    },
  };

  const result = resolveRefs(input);

  const expected = {
    type: 'object',
    properties: {
      address: {
        type: 'object',
        properties: {
          street: { type: 'string' },
        },
        nullable: true,
      },
    },
  };

  assert.deepStrictEqual(result, expected);
  console.log('  testAnyOfWithRefInside');
}

function testDepthLimitSafeguard() {
  // Build a chain of $defs where each references the next, exceeding MAX_INLINE_DEPTH (50)
  const defs: Record<string, unknown> = {};
  for (let i = 0; i < 60; i++) {
    if (i === 59) {
      defs[`Def${i}`] = { type: 'string' };
    } else {
      defs[`Def${i}`] = { $ref: `#/$defs/Def${i + 1}` };
    }
  }

  const input = {
    type: 'object',
    properties: {
      value: { $ref: '#/$defs/Def0' },
    },
    $defs: defs,
  };

  assert.throws(
    () => resolveRefs(input),
    (error: Error) => {
      assert.ok(error.message.includes('exceeded max inline depth'), `Unexpected error message: ${error.message}`);
      return true;
    },
  );

  console.log('  testDepthLimitSafeguard');
}

async function main() {
  console.log('=== Testing resolveRefs ===\n');

  const tests = [
    testSimpleRefResolution,
    testMultipleRefsToSameDefinition,
    testNestedRefs,
    testArrayItemsWithRef,
    testNoDefsPassthrough,
    testAnyOfNullableConversion,
    testAnyOfNullableReversedOrder,
    testAnyOfWithRefInside,
    testDepthLimitSafeguard,
  ];

  let passed = 0;
  let failed = 0;
  const failures: Array<{ name: string; error: Error }> = [];

  for (const test of tests) {
    try {
      test();
      passed++;
    } catch (error) {
      failed++;
      failures.push({ name: test.name, error: error as Error });
      console.error(`  FAIL ${test.name}: ${(error as Error).message}`);
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  if (failures.length > 0) {
    console.error('\nFailures:');
    for (const { name, error } of failures) {
      console.error(`  ${name}:`, error);
    }
    process.exit(1);
  }
}

main();
