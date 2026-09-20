import { pgTable, uuid, text, integer, boolean, jsonb, primaryKey, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces, users } from './core';
import { skills } from './skills';

// ============================================================ Agents & skills

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  provider: text('provider', { enum: ['openai', 'anthropic', 'openrouter'] }).notNull(),
  model: text('model').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  outputSchema: jsonb('output_schema'),
  // Review execution strategy — whole diff in one call (default) vs per-file.
  strategy: text('strategy', { enum: ['single-pass', 'map-reduce', 'auto'] })
    .notNull()
    .default('single-pass'),
  // CI gate policy — when a CI review should BLOCK (REQUEST_CHANGES + fail the
  // check) vs just comment. Deterministic from finding severities.
  ciFailOn: text('ci_fail_on', { enum: ['never', 'critical', 'warning', 'any'] })
    .notNull()
    .default('critical'),
  // Whether this agent's reviews get repo-intel context (repo skeleton + callers
  // + file-rank note) injected into the prompt. Default on; the global
  // REPO_INTEL_ENABLED flag is the second gate (facade degrades when off).
  repoIntel: boolean('repo_intel').notNull().default(true),
  enabled: boolean('enabled').notNull().default(true),
  version: integer('version').notNull().default(1),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: now(),
});

export const agentVersions = pgTable(
  'agent_versions',
  {
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    configJson: jsonb('config_json').notNull(),
    createdAt: now(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.agentId, t.version] }) }),
);

export const agentSkills = pgTable(
  'agent_skills',
  {
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    // A reusable skill can be attached to several agents but enabled only for
    // selected ones. `skills.enabled` remains the workspace-wide kill switch.
    enabled: boolean('enabled').notNull().default(true),
    order: integer('order').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.agentId, t.skillId] }),
    // The PK leads with agent_id; skill_id lookups (usage counts, FK cascade on
    // skill delete) need their own index.
    skillIdx: index('agent_skills_skill_idx').on(t.skillId),
  }),
);
