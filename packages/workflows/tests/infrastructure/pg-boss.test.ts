/// <reference types="vitest/globals" />
import { describe, it, expect } from 'vitest';
import { createSendOptions, getQueueConfig, createWorkOptions } from '../../src/infrastructure/pg-boss';
import type { QueueConfig, QueueDefinition } from '../../src/types';

describe('createSendOptions', () => {
  const baseConfig: QueueConfig = {
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 3600,
  };

  it('should create send options from config', () => {
    const options = createSendOptions(baseConfig);

    expect(options.retryLimit).toBe(3);
    expect(options.retryDelay).toBe(60);
    expect(options.retryBackoff).toBe(true);
    expect(options.expireInSeconds).toBe(3600);
  });

  it('should apply overrides when provided', () => {
    const options = createSendOptions(baseConfig, {
      priority: 5,
      startAfter: 30,
      singletonKey: 'unique-key',
    });

    expect(options.priority).toBe(5);
    expect(options.startAfter).toBe(30);
    expect(options.singletonKey).toBe('unique-key');
    // Base config should still be there
    expect(options.retryLimit).toBe(3);
  });

  it('should NOT include undefined values in the result when spreading overrides', () => {
    // This test catches the bug where undefined values were being passed to pg-boss
    // pg-boss validates that priority must be an integer, so passing undefined causes an error
    const options = createSendOptions(baseConfig, {
      priority: undefined,
      startAfter: undefined,
      singletonKey: undefined,
    });

    // The key insight: when spreading { priority: undefined }, the key IS present
    // but pg-boss rejects undefined values. This test ensures the options object
    // doesn't contain these keys with undefined values.
    expect(Object.keys(options)).not.toContain('priority');
    expect(Object.keys(options)).not.toContain('startAfter');
    expect(Object.keys(options)).not.toContain('singletonKey');
  });

  it('should only include defined override values', () => {
    // When only some overrides are defined, only those should be included
    const options = createSendOptions(baseConfig, {
      priority: 10,
      startAfter: undefined,
      singletonKey: 'test-key',
    });

    expect(options.priority).toBe(10);
    expect(options.singletonKey).toBe('test-key');
    expect(Object.keys(options)).not.toContain('startAfter');
  });

  it('should work with no overrides', () => {
    const options = createSendOptions(baseConfig);

    expect(options.retryLimit).toBe(3);
    expect(Object.keys(options)).not.toContain('priority');
    expect(Object.keys(options)).not.toContain('startAfter');
    expect(Object.keys(options)).not.toContain('singletonKey');
  });

  it('should work with empty overrides object', () => {
    const options = createSendOptions(baseConfig, {});

    expect(options.retryLimit).toBe(3);
    expect(Object.keys(options)).not.toContain('priority');
  });
});

describe('getQueueConfig', () => {
  it('should return defaults for empty config', () => {
    const config = getQueueConfig({});

    expect(config.retryLimit).toBeDefined();
    expect(config.retryDelay).toBeDefined();
    expect(config.retryBackoff).toBeDefined();
    expect(config.expireInSeconds).toBeDefined();
    expect(config.retentionSeconds).toBeDefined();
  });

  it('should override defaults with provided values', () => {
    const config = getQueueConfig({
      retryLimit: 10,
      retryDelay: 120,
    });

    expect(config.retryLimit).toBe(10);
    expect(config.retryDelay).toBe(120);
  });
});

describe('createWorkOptions', () => {
  it('should create work options from queue definition', () => {
    const queue: QueueDefinition = {
      name: 'test-queue',
      batchSize: 5,
      pollingIntervalMs: 5000,
    };

    const options = createWorkOptions(queue);

    expect(options.batchSize).toBe(5);
    expect(options.pollingIntervalSeconds).toBe(5);
  });

  it('should use defaults when values not provided', () => {
    const queue: QueueDefinition = {
      name: 'test-queue',
    };

    const options = createWorkOptions(queue);

    expect(options.batchSize).toBe(1);
    expect(options.pollingIntervalSeconds).toBe(2);
  });
});
