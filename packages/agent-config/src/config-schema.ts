import { z } from 'zod';

/** Which native instruction format a renderer should target. */
export const InstructionTargetSchema = z.enum([
  'claude',
  'cursor',
  'codex',
  'antigravity',
  'generic',
]);
export type InstructionTarget = z.infer<typeof InstructionTargetSchema>;

/** How (and whether) to register the daemon's MCP server for this agent. */
export const McpRegistrationSchema = z.enum(['claude', 'cursor', 'codex', 'mcp-json', 'none']);
export type McpRegistration = z.infer<typeof McpRegistrationSchema>;

/**
 * One agent definition. The `command`/`args` are templates containing
 * placeholders like `{prompt}` — they are **data**, never code. Changing a
 * vendor flag is an edit here, not a code change.
 */
export const AgentConfigSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  /** Executable name or path. May contain placeholders. */
  command: z.string().min(1),
  /** Argument templates; each entry may contain placeholders. */
  args: z.array(z.string()).default([]),
  /** Extra environment variables (values may contain placeholders). */
  env: z.record(z.string()).optional(),
  /** Working directory override (placeholders allowed). Defaults to the sandbox. */
  cwd: z.string().optional(),
  /** How to detect availability: any of these executables must be on PATH. */
  detect: z
    .object({
      anyOf: z.array(z.string()).min(1),
    })
    .optional(),
  /** Where to render this agent's instruction file. */
  instructions: z
    .object({
      target: InstructionTargetSchema,
      file: z.string().min(1),
    })
    .optional(),
  /** How to register the daemon MCP server for this agent. */
  mcp: z
    .object({
      register: McpRegistrationSchema,
    })
    .optional(),
  /** Optional regexes that map log lines to structured events. */
  parse: z
    .object({
      planReady: z.string().optional(),
      error: z.string().optional(),
    })
    .optional(),
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/** The top-level `agents.config.json` document. */
export const AgentsConfigSchema = z.object({
  version: z.literal(1).default(1),
  defaultAgent: z.string().optional(),
  agents: z.array(AgentConfigSchema).default([]),
});
export type AgentsConfig = z.infer<typeof AgentsConfigSchema>;

/** Parse and validate an `agents.config.json` value without throwing. */
export function parseAgentsConfig(value: unknown):
  | { ok: true; config: AgentsConfig }
  | { ok: false; error: z.ZodError } {
  const result = AgentsConfigSchema.safeParse(value);
  return result.success
    ? { ok: true, config: result.data }
    : { ok: false, error: result.error };
}
