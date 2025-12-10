/**
 * Workflow template registry.
 *
 * This module provides registration and lookup of workflow templates.
 * Templates must be registered before workflows of that type can be started.
 *
 * @example
 * ```typescript
 * import { createTemplateRegistry } from '@sprqvntrs/workflows';
 *
 * const registry = createTemplateRegistry();
 *
 * registry.register({
 *   type: 'my-workflow',
 *   queue: 'default',
 *   version: '1.0.0',
 *   stages: [...]
 * });
 *
 * const template = registry.get('my-workflow');
 * ```
 */

import type { WorkflowTemplate, StageTemplate, OperationTemplate, CheckpointTemplate } from '../types';
import { TemplateError } from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * Template registry interface.
 *
 * Provides methods for registering, retrieving, and validating templates.
 */
export interface TemplateRegistry {
  /**
   * Registers a workflow template.
   *
   * @param template - Template to register
   * @throws TemplateError if template is invalid or already registered
   */
  register: (template: WorkflowTemplate) => void;

  /**
   * Registers multiple templates at once.
   *
   * @param templates - Templates to register
   * @throws TemplateError if any template is invalid
   */
  registerMany: (templates: WorkflowTemplate[]) => void;

  /**
   * Gets a template by type.
   *
   * @param type - Workflow type
   * @returns Template or undefined
   */
  get: (type: string) => WorkflowTemplate | undefined;

  /**
   * Gets a template by type, throwing if not found.
   *
   * @param type - Workflow type
   * @returns Template
   * @throws TemplateError if template not found
   */
  getOrThrow: (type: string) => WorkflowTemplate;

  /**
   * Checks if a template is registered.
   *
   * @param type - Workflow type
   * @returns True if template exists
   */
  has: (type: string) => boolean;

  /**
   * Gets all registered template types.
   *
   * @returns Array of workflow types
   */
  types: () => string[];

  /**
   * Gets all registered templates.
   *
   * @returns Array of templates
   */
  all: () => WorkflowTemplate[];

  /**
   * Validates a template without registering it.
   *
   * @param template - Template to validate
   * @returns Array of validation errors (empty if valid)
   */
  validate: (template: WorkflowTemplate) => ValidationError[];

  /**
   * Validates all registered templates.
   *
   * @param operationTypes - Set of registered operation types
   * @returns Array of validation errors
   */
  validateAll: (operationTypes: Set<string>) => ValidationError[];

  /**
   * Unregisters a template.
   *
   * @param type - Workflow type to remove
   * @returns True if template was removed
   */
  unregister: (type: string) => boolean;

  /**
   * Clears all registered templates.
   */
  clear: () => void;
}

/**
 * Validation error details.
 */
export interface ValidationError {
  /**
   * Workflow type with the error.
   */
  workflowType: string;

  /**
   * Path to the error (e.g., 'stages[0].operations[1]').
   */
  path: string;

  /**
   * Error message.
   */
  message: string;
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validates a workflow template.
 *
 * Checks for structural correctness but not operation handler existence.
 *
 * @param template - Template to validate
 * @returns Array of validation errors
 */
export function validateTemplate(template: WorkflowTemplate): ValidationError[] {
  const errors: ValidationError[] = [];
  const type = template.type || '<unknown>';

  // Required fields
  if (!template.type || typeof template.type !== 'string') {
    errors.push({ workflowType: type, path: 'type', message: 'type is required and must be a string' });
  }

  if (!template.queue || typeof template.queue !== 'string') {
    errors.push({ workflowType: type, path: 'queue', message: 'queue is required and must be a string' });
  }

  if (!template.version || typeof template.version !== 'string') {
    errors.push({ workflowType: type, path: 'version', message: 'version is required and must be a string' });
  }

  // Stages
  if (!Array.isArray(template.stages) || template.stages.length === 0) {
    errors.push({ workflowType: type, path: 'stages', message: 'stages must be a non-empty array' });
  } else {
    const stageNames = new Set<string>();

    template.stages.forEach((stage, stageIndex) => {
      const stagePath = `stages[${stageIndex}]`;
      errors.push(...validateStage(type, stagePath, stage, stageNames));
    });
  }

  // Checkpoints
  if (template.checkpoints) {
    if (!Array.isArray(template.checkpoints)) {
      errors.push({ workflowType: type, path: 'checkpoints', message: 'checkpoints must be an array' });
    } else {
      const stageNames = new Set(template.stages?.map((s) => s.name) ?? []);

      template.checkpoints.forEach((checkpoint, index) => {
        const checkpointPath = `checkpoints[${index}]`;
        errors.push(...validateCheckpoint(type, checkpointPath, checkpoint, stageNames));
      });
    }
  }

  // Next workflow (just validate type)
  if (template.nextWorkflow !== undefined && typeof template.nextWorkflow !== 'string') {
    errors.push({ workflowType: type, path: 'nextWorkflow', message: 'nextWorkflow must be a string' });
  }

  // Coordination
  if (template.coordination) {
    if (!template.coordination.entityType || typeof template.coordination.entityType !== 'string') {
      errors.push({
        workflowType: type,
        path: 'coordination.entityType',
        message: 'coordination.entityType is required',
      });
    }
    if (!template.coordination.entityIdPath || typeof template.coordination.entityIdPath !== 'string') {
      errors.push({
        workflowType: type,
        path: 'coordination.entityIdPath',
        message: 'coordination.entityIdPath is required',
      });
    }
  }

  return errors;
}

/**
 * Validates a stage template.
 */
function validateStage(
  workflowType: string,
  path: string,
  stage: StageTemplate,
  existingNames: Set<string>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Name
  if (!stage.name || typeof stage.name !== 'string') {
    errors.push({ workflowType, path: `${path}.name`, message: 'stage name is required' });
  } else if (existingNames.has(stage.name)) {
    errors.push({ workflowType, path: `${path}.name`, message: `duplicate stage name: ${stage.name}` });
  } else {
    existingNames.add(stage.name);
  }

  // Operations
  if (!Array.isArray(stage.operations) || stage.operations.length === 0) {
    errors.push({ workflowType, path: `${path}.operations`, message: 'operations must be a non-empty array' });
  } else {
    stage.operations.forEach((op, opIndex) => {
      const opPath = `${path}.operations[${opIndex}]`;
      errors.push(...validateOperation(workflowType, opPath, op));
    });
  }

  // Fix operations (optional)
  if (stage.fixOperations) {
    if (!Array.isArray(stage.fixOperations)) {
      errors.push({ workflowType, path: `${path}.fixOperations`, message: 'fixOperations must be an array' });
    } else {
      stage.fixOperations.forEach((op, opIndex) => {
        const opPath = `${path}.fixOperations[${opIndex}]`;
        errors.push(...validateOperation(workflowType, opPath, op));
      });
    }
  }

  // Max fix cycles
  if (stage.maxFixCycles !== undefined) {
    if (typeof stage.maxFixCycles !== 'number' || stage.maxFixCycles < 1) {
      errors.push({
        workflowType,
        path: `${path}.maxFixCycles`,
        message: 'maxFixCycles must be a positive number',
      });
    }
    if (!stage.fixOperations || stage.fixOperations.length === 0) {
      errors.push({
        workflowType,
        path: `${path}.maxFixCycles`,
        message: 'maxFixCycles requires fixOperations to be defined',
      });
    }
  }

  return errors;
}

/**
 * Validates an operation template.
 */
function validateOperation(
  workflowType: string,
  path: string,
  operation: OperationTemplate,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!operation.type || typeof operation.type !== 'string') {
    errors.push({ workflowType, path: `${path}.type`, message: 'operation type is required' });
  }

  if (operation.timeout !== undefined && (typeof operation.timeout !== 'number' || operation.timeout < 0)) {
    errors.push({ workflowType, path: `${path}.timeout`, message: 'timeout must be a non-negative number' });
  }

  if (
    operation.maxAttempts !== undefined &&
    (typeof operation.maxAttempts !== 'number' || operation.maxAttempts < 1)
  ) {
    errors.push({ workflowType, path: `${path}.maxAttempts`, message: 'maxAttempts must be at least 1' });
  }

  if (operation.critical !== undefined && typeof operation.critical !== 'boolean') {
    errors.push({ workflowType, path: `${path}.critical`, message: 'critical must be a boolean' });
  }

  if (operation.condition !== undefined && typeof operation.condition !== 'function') {
    errors.push({ workflowType, path: `${path}.condition`, message: 'condition must be a function' });
  }

  return errors;
}

/**
 * Validates a checkpoint template.
 */
function validateCheckpoint(
  workflowType: string,
  path: string,
  checkpoint: CheckpointTemplate,
  stageNames: Set<string>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!checkpoint.after || typeof checkpoint.after !== 'string') {
    errors.push({ workflowType, path: `${path}.after`, message: 'checkpoint after is required' });
  } else if (!stageNames.has(checkpoint.after)) {
    errors.push({
      workflowType,
      path: `${path}.after`,
      message: `checkpoint references unknown stage: ${checkpoint.after}`,
    });
  }

  if (!checkpoint.status || typeof checkpoint.status !== 'string') {
    errors.push({ workflowType, path: `${path}.status`, message: 'checkpoint status is required' });
  }

  if (checkpoint.condition !== undefined && typeof checkpoint.condition !== 'function') {
    errors.push({ workflowType, path: `${path}.condition`, message: 'condition must be a function' });
  }

  if (
    checkpoint.autoResumeAfter !== undefined &&
    (typeof checkpoint.autoResumeAfter !== 'number' || checkpoint.autoResumeAfter < 0)
  ) {
    errors.push({
      workflowType,
      path: `${path}.autoResumeAfter`,
      message: 'autoResumeAfter must be a non-negative number',
    });
  }

  return errors;
}

/**
 * Validates that all operation types in a template have registered handlers.
 *
 * @param template - Template to check
 * @param operationTypes - Set of registered operation types
 * @returns Array of validation errors
 */
export function validateOperationHandlers(
  template: WorkflowTemplate,
  operationTypes: Set<string>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  template.stages.forEach((stage, stageIndex) => {
    stage.operations.forEach((op, opIndex) => {
      if (!operationTypes.has(op.type)) {
        errors.push({
          workflowType: template.type,
          path: `stages[${stageIndex}].operations[${opIndex}].type`,
          message: `no handler registered for operation type: ${op.type}`,
        });
      }
    });

    stage.fixOperations?.forEach((op, opIndex) => {
      if (!operationTypes.has(op.type)) {
        errors.push({
          workflowType: template.type,
          path: `stages[${stageIndex}].fixOperations[${opIndex}].type`,
          message: `no handler registered for operation type: ${op.type}`,
        });
      }
    });
  });

  return errors;
}

// =============================================================================
// Registry Factory
// =============================================================================

/**
 * Creates a new template registry.
 *
 * The registry stores workflow templates and provides validation.
 *
 * @returns Template registry instance
 *
 * @example
 * ```typescript
 * const registry = createTemplateRegistry();
 *
 * // Register a template
 * registry.register({
 *   type: 'content-generation',
 *   queue: 'default',
 *   version: '1.0.0',
 *   stages: [
 *     {
 *       name: 'gather',
 *       operations: [{ type: 'gather.data' }],
 *     },
 *     {
 *       name: 'generate',
 *       operations: [{ type: 'generate.content' }],
 *     },
 *   ],
 * });
 *
 * // Get template
 * const template = registry.getOrThrow('content-generation');
 *
 * // Validate all templates against registered operations
 * const operationTypes = new Set(['gather.data', 'generate.content']);
 * const errors = registry.validateAll(operationTypes);
 * if (errors.length > 0) {
 *   throw new Error(`Template validation failed: ${JSON.stringify(errors)}`);
 * }
 * ```
 */
export function createTemplateRegistry(): TemplateRegistry {
  const templates = new Map<string, WorkflowTemplate>();

  return {
    register(template: WorkflowTemplate): void {
      // Validate first
      const errors = validateTemplate(template);
      if (errors.length > 0) {
        throw new TemplateError(`Invalid template "${template.type}": ${errors.map((e) => e.message).join(', ')}`, {
          errors,
        });
      }

      // Check for duplicates
      if (templates.has(template.type)) {
        throw new TemplateError(`Template "${template.type}" is already registered`);
      }

      templates.set(template.type, template);
    },

    registerMany(templateList: WorkflowTemplate[]): void {
      // Validate all first
      const allErrors: ValidationError[] = [];
      for (const template of templateList) {
        allErrors.push(...validateTemplate(template));
      }

      if (allErrors.length > 0) {
        throw new TemplateError(`Invalid templates: ${allErrors.map((e) => `${e.workflowType}: ${e.message}`).join('; ')}`, {
          errors: allErrors,
        });
      }

      // Check for duplicates among new templates
      const newTypes = new Set<string>();
      for (const template of templateList) {
        if (newTypes.has(template.type)) {
          throw new TemplateError(`Duplicate template type in batch: ${template.type}`);
        }
        if (templates.has(template.type)) {
          throw new TemplateError(`Template "${template.type}" is already registered`);
        }
        newTypes.add(template.type);
      }

      // Register all
      for (const template of templateList) {
        templates.set(template.type, template);
      }
    },

    get(type: string): WorkflowTemplate | undefined {
      return templates.get(type);
    },

    getOrThrow(type: string): WorkflowTemplate {
      const template = templates.get(type);
      if (!template) {
        throw new TemplateError(`Template "${type}" not found`, { type });
      }
      return template;
    },

    has(type: string): boolean {
      return templates.has(type);
    },

    types(): string[] {
      return Array.from(templates.keys());
    },

    all(): WorkflowTemplate[] {
      return Array.from(templates.values());
    },

    validate(template: WorkflowTemplate): ValidationError[] {
      return validateTemplate(template);
    },

    validateAll(operationTypes: Set<string>): ValidationError[] {
      const errors: ValidationError[] = [];

      for (const template of templates.values()) {
        errors.push(...validateOperationHandlers(template, operationTypes));
      }

      return errors;
    },

    unregister(type: string): boolean {
      return templates.delete(type);
    },

    clear(): void {
      templates.clear();
    },
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Gets all unique operation types from a template.
 *
 * @param template - Workflow template
 * @returns Set of operation type strings
 *
 * @example
 * ```typescript
 * const types = getOperationTypes(template);
 * // Set { 'gather.data', 'analyze.content', 'generate.report' }
 * ```
 */
export function getOperationTypes(template: WorkflowTemplate): Set<string> {
  const types = new Set<string>();

  for (const stage of template.stages) {
    for (const op of stage.operations) {
      types.add(op.type);
    }
    for (const op of stage.fixOperations ?? []) {
      types.add(op.type);
    }
  }

  return types;
}

/**
 * Gets all unique queue names from templates.
 *
 * @param templateList - Array of templates
 * @returns Set of queue names
 *
 * @example
 * ```typescript
 * const queues = getQueueNames(templates);
 * // Set { 'default', 'heavy', 'sequential' }
 * ```
 */
export function getQueueNames(templateList: WorkflowTemplate[]): Set<string> {
  return new Set(templateList.map((t) => t.queue));
}
