/**
 * @clicksmith/agent-config
 *
 * Config-driven agent adapters and the shared ClickSmith instruction template.
 * Built-in adapters are *data* (`agents.config.json`); the launcher only ever
 * resolves placeholders. Instruction text is authored once and rendered to each
 * agent's native file format.
 */

export * from './types.js';
export * from './config-schema.js';
export * from './placeholders.js';
export * from './adapter.js';
export * from './bin-exists.js';
export * from './instruction-template.js';
export * from './renderers.js';
export * from './defaults.js';
export * from './merge.js';
