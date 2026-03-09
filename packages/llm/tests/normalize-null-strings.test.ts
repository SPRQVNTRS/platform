import assert from 'node:assert';
import { z } from 'zod/v4';
import { normalizeNullStrings } from '../src/utils/normalize-null-strings.js';

/**
 * Test script for normalizeNullStrings
 *
 * Run with: pnpm tsx tests/normalize-null-strings.test.ts
 */

function testNullableString() {
  const schema = z.object({ field: z.string().nullable() });
  const data = { field: 'null' };
  normalizeNullStrings(data, schema);
  assert.deepStrictEqual(data, { field: null });
  console.log('  testNullableString');
}

function testNullableOptionalString() {
  const schema = z.object({ field: z.string().nullable().optional() });
  const data = { field: 'null' };
  normalizeNullStrings(data, schema);
  assert.deepStrictEqual(data, { field: null });
  console.log('  testNullableOptionalString');
}

function testNullableNumber() {
  const schema = z.object({ field: z.number().nullable() });
  const data = { field: 'null' };
  normalizeNullStrings(data, schema);
  assert.deepStrictEqual(data, { field: null });
  console.log('  testNullableNumber');
}

function testNonNullableStringPreserved() {
  const schema = z.object({ field: z.string() });
  const data = { field: 'null' };
  normalizeNullStrings(data, schema);
  assert.deepStrictEqual(data, { field: 'null' });
  console.log('  testNonNullableStringPreserved');
}

function testNestedObjectNullableFields() {
  const schema = z.object({
    name: z.string(),
    address: z.object({
      street: z.string().nullable(),
      city: z.string(),
      zip: z.string().nullable(),
    }),
  });
  const data = {
    name: 'Alice',
    address: {
      street: 'null',
      city: 'Springfield',
      zip: 'null',
    },
  };
  normalizeNullStrings(data, schema);
  assert.deepStrictEqual(data, {
    name: 'Alice',
    address: {
      street: null,
      city: 'Springfield',
      zip: null,
    },
  });
  console.log('  testNestedObjectNullableFields');
}

function testArrayOfObjectsWithNullableFields() {
  const schema = z.array(z.object({ f: z.string().nullable() }));
  const data = [{ f: 'null' }, { f: 'hello' }, { f: 'null' }];
  normalizeNullStrings(data, schema);
  assert.deepStrictEqual(data, [{ f: null }, { f: 'hello' }, { f: null }]);
  console.log('  testArrayOfObjectsWithNullableFields');
}

function testArrayOfNullableElements() {
  const schema = z.array(z.string().nullable());
  const data = ['null', 'hello', 'null', 'world'];
  normalizeNullStrings(data, schema);
  assert.deepStrictEqual(data, [null, 'hello', null, 'world']);
  console.log('  testArrayOfNullableElements');
}

function testDeepWrapperStack() {
  const schema = z.object({
    field: z.string().nullable().optional().default(null),
  });
  const data = { field: 'null' };
  normalizeNullStrings(data, schema);
  assert.deepStrictEqual(data, { field: null });
  console.log('  testDeepWrapperStack');
}

function testEmptyObjectsAndArrays() {
  const objectSchema = z.object({ f: z.string().nullable() });
  const emptyObj = {};
  normalizeNullStrings(emptyObj, objectSchema);
  assert.deepStrictEqual(emptyObj, {});

  const arraySchema = z.array(z.string().nullable());
  const emptyArr: unknown[] = [];
  normalizeNullStrings(emptyArr, arraySchema);
  assert.deepStrictEqual(emptyArr, []);

  console.log('  testEmptyObjectsAndArrays');
}

function testAlreadyNullUnchanged() {
  const schema = z.object({ field: z.string().nullable() });
  const data = { field: null };
  normalizeNullStrings(data, schema);
  assert.deepStrictEqual(data, { field: null });
  console.log('  testAlreadyNullUnchanged');
}

function testNonNullStringsUnchanged() {
  const schema = z.object({
    a: z.string().nullable(),
    b: z.string().nullable(),
    c: z.string().nullable(),
  });
  const data = { a: 'hello', b: '', c: 'undefined' };
  normalizeNullStrings(data, schema);
  assert.deepStrictEqual(data, { a: 'hello', b: '', c: 'undefined' });
  console.log('  testNonNullStringsUnchanged');
}

function testRootLevelNullable() {
  const schema = z.string().nullable();
  const result = normalizeNullStrings('null', schema);
  assert.strictEqual(result, null);

  // Non-"null" strings should pass through
  const result2 = normalizeNullStrings('hello', schema);
  assert.strictEqual(result2, 'hello');

  // Already null should stay null
  const result3 = normalizeNullStrings(null, schema);
  assert.strictEqual(result3, null);

  console.log('  testRootLevelNullable');
}

async function main() {
  console.log('=== Testing normalizeNullStrings ===\n');

  const tests = [
    testNullableString,
    testNullableOptionalString,
    testNullableNumber,
    testNonNullableStringPreserved,
    testNestedObjectNullableFields,
    testArrayOfObjectsWithNullableFields,
    testArrayOfNullableElements,
    testDeepWrapperStack,
    testEmptyObjectsAndArrays,
    testAlreadyNullUnchanged,
    testNonNullStringsUnchanged,
    testRootLevelNullable,
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
