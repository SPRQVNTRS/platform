/// <reference types="vitest/globals" />
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTemplateRegistry,
  validateTemplate,
  getOperationTypes,
  getQueueNames,
  type TemplateRegistry,
} from '../../src/templates/registry';
import type { WorkflowTemplate } from '../../src/types';

describe('TemplateRegistry', () => {
  let registry: TemplateRegistry;

  beforeEach(() => {
    registry = createTemplateRegistry();
  });

  const validTemplate: WorkflowTemplate = {
    type: 'test-workflow',
    queue: 'default',
    version: '1.0.0',
    description: 'A test workflow',
    stages: [
      {
        name: 'gather',
        operations: [{ type: 'gather.data', timeout: 30000 }],
      },
      {
        name: 'process',
        parallel: true,
        operations: [
          { type: 'process.analyze' },
          { type: 'process.transform' },
        ],
      },
    ],
  };

  describe('register', () => {
    it('should register a valid template', () => {
      expect(() => registry.register(validTemplate)).not.toThrow();
      expect(registry.has('test-workflow')).toBe(true);
    });

    it('should throw when registering an invalid template', () => {
      const invalidTemplate = {
        type: '',
        queue: 'default',
        version: '1.0.0',
        stages: [],
      } as WorkflowTemplate;

      expect(() => registry.register(invalidTemplate)).toThrow();
    });

    it('should throw when registering duplicate template', () => {
      registry.register(validTemplate);
      expect(() => registry.register(validTemplate)).toThrow(/already registered/);
    });
  });

  describe('registerMany', () => {
    it('should register multiple valid templates', () => {
      const template2: WorkflowTemplate = {
        ...validTemplate,
        type: 'test-workflow-2',
      };

      registry.registerMany([validTemplate, template2]);

      expect(registry.has('test-workflow')).toBe(true);
      expect(registry.has('test-workflow-2')).toBe(true);
    });

    it('should throw if any template is invalid', () => {
      const invalidTemplate = {
        ...validTemplate,
        type: '',
      } as WorkflowTemplate;

      expect(() => registry.registerMany([validTemplate, invalidTemplate])).toThrow();
      expect(registry.has('test-workflow')).toBe(false); // Neither should be registered
    });

    it('should throw on duplicate types within batch', () => {
      expect(() => registry.registerMany([validTemplate, validTemplate])).toThrow(/Duplicate/);
    });
  });

  describe('get', () => {
    it('should return registered template', () => {
      registry.register(validTemplate);
      const template = registry.get('test-workflow');

      expect(template).toBeDefined();
      expect(template?.type).toBe('test-workflow');
    });

    it('should return undefined for non-existent template', () => {
      expect(registry.get('non-existent')).toBeUndefined();
    });
  });

  describe('getOrThrow', () => {
    it('should return registered template', () => {
      registry.register(validTemplate);
      const template = registry.getOrThrow('test-workflow');

      expect(template.type).toBe('test-workflow');
    });

    it('should throw for non-existent template', () => {
      expect(() => registry.getOrThrow('non-existent')).toThrow(/not found/);
    });
  });

  describe('types', () => {
    it('should return all registered types', () => {
      registry.register(validTemplate);
      registry.register({ ...validTemplate, type: 'test-workflow-2' });

      const types = registry.types();
      expect(types).toContain('test-workflow');
      expect(types).toContain('test-workflow-2');
      expect(types).toHaveLength(2);
    });
  });

  describe('all', () => {
    it('should return all registered templates', () => {
      registry.register(validTemplate);
      registry.register({ ...validTemplate, type: 'test-workflow-2' });

      const templates = registry.all();
      expect(templates).toHaveLength(2);
    });
  });

  describe('unregister', () => {
    it('should remove registered template', () => {
      registry.register(validTemplate);
      const removed = registry.unregister('test-workflow');

      expect(removed).toBe(true);
      expect(registry.has('test-workflow')).toBe(false);
    });

    it('should return false for non-existent template', () => {
      expect(registry.unregister('non-existent')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all templates', () => {
      registry.register(validTemplate);
      registry.register({ ...validTemplate, type: 'test-workflow-2' });

      registry.clear();

      expect(registry.types()).toHaveLength(0);
    });
  });

  describe('validateAll', () => {
    it('should return errors for missing operation handlers', () => {
      registry.register(validTemplate);

      const operationTypes = new Set<string>(); // Empty - no handlers
      const errors = registry.validateAll(operationTypes);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.message).toContain('no handler registered');
    });

    it('should return no errors when all handlers exist', () => {
      registry.register(validTemplate);

      const operationTypes = new Set(['gather.data', 'process.analyze', 'process.transform']);
      const errors = registry.validateAll(operationTypes);

      expect(errors).toHaveLength(0);
    });
  });
});

describe('validateTemplate', () => {
  it('should return errors for missing required fields', () => {
    const errors = validateTemplate({} as WorkflowTemplate);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.path === 'type')).toBe(true);
    expect(errors.some((e) => e.path === 'queue')).toBe(true);
    expect(errors.some((e) => e.path === 'version')).toBe(true);
    expect(errors.some((e) => e.path === 'stages')).toBe(true);
  });

  it('should return errors for duplicate stage names', () => {
    const template: WorkflowTemplate = {
      type: 'test',
      queue: 'default',
      version: '1.0.0',
      stages: [
        { name: 'stage1', operations: [{ type: 'op1' }] },
        { name: 'stage1', operations: [{ type: 'op2' }] }, // Duplicate
      ],
    };

    const errors = validateTemplate(template);
    expect(errors.some((e) => e.message.includes('duplicate stage name'))).toBe(true);
  });

  it('should return errors for empty operations', () => {
    const template: WorkflowTemplate = {
      type: 'test',
      queue: 'default',
      version: '1.0.0',
      stages: [{ name: 'stage1', operations: [] }],
    };

    const errors = validateTemplate(template);
    expect(errors.some((e) => e.path.includes('operations'))).toBe(true);
  });

  it('should return errors for invalid checkpoint references', () => {
    const template: WorkflowTemplate = {
      type: 'test',
      queue: 'default',
      version: '1.0.0',
      stages: [{ name: 'stage1', operations: [{ type: 'op1' }] }],
      checkpoints: [{ after: 'non-existent', status: 'ready' }],
    };

    const errors = validateTemplate(template);
    expect(errors.some((e) => e.message.includes('unknown stage'))).toBe(true);
  });

  it('should return errors for maxFixCycles without fixOperations', () => {
    const template: WorkflowTemplate = {
      type: 'test',
      queue: 'default',
      version: '1.0.0',
      stages: [
        {
          name: 'stage1',
          operations: [{ type: 'op1' }],
          maxFixCycles: 3, // Without fixOperations
        },
      ],
    };

    const errors = validateTemplate(template);
    expect(errors.some((e) => e.message.includes('requires fixOperations'))).toBe(true);
  });

  it('should return no errors for valid template', () => {
    const template: WorkflowTemplate = {
      type: 'test',
      queue: 'default',
      version: '1.0.0',
      stages: [
        {
          name: 'stage1',
          operations: [{ type: 'op1', timeout: 30000, maxAttempts: 3 }],
        },
      ],
      checkpoints: [{ after: 'stage1', status: 'ready' }],
    };

    const errors = validateTemplate(template);
    expect(errors).toHaveLength(0);
  });
});

describe('getOperationTypes', () => {
  it('should extract all operation types from template', () => {
    const template: WorkflowTemplate = {
      type: 'test',
      queue: 'default',
      version: '1.0.0',
      stages: [
        {
          name: 'stage1',
          operations: [{ type: 'op1' }, { type: 'op2' }],
          fixOperations: [{ type: 'fix1' }],
        },
        {
          name: 'stage2',
          operations: [{ type: 'op3' }],
        },
      ],
    };

    const types = getOperationTypes(template);

    expect(types).toContain('op1');
    expect(types).toContain('op2');
    expect(types).toContain('op3');
    expect(types).toContain('fix1');
    expect(types.size).toBe(4);
  });
});

describe('getQueueNames', () => {
  it('should extract unique queue names from templates', () => {
    const templates: WorkflowTemplate[] = [
      { type: 't1', queue: 'queue1', version: '1.0.0', stages: [{ name: 's', operations: [{ type: 'o' }] }] },
      { type: 't2', queue: 'queue2', version: '1.0.0', stages: [{ name: 's', operations: [{ type: 'o' }] }] },
      { type: 't3', queue: 'queue1', version: '1.0.0', stages: [{ name: 's', operations: [{ type: 'o' }] }] }, // Duplicate
    ];

    const queues = getQueueNames(templates);

    expect(queues).toContain('queue1');
    expect(queues).toContain('queue2');
    expect(queues.size).toBe(2);
  });
});
