import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  numeric,
  boolean,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';

// ============================================================ Review & findings

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id'),
    /** The agent_run that produced this review (links the timeline run ↔ review). */
    runId: uuid('run_id'),
    kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
    verdict: text('verdict'),
    summary: text('summary'),
    score: integer('score'),
    model: text('model'),
    createdAt: now(),
  },
  (t) => ({
    // The PR timeline and findings rollups look reviews up by run_id (no FK).
    runIdx: index('reviews_run_idx').on(t.runId),
  }),
);

export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewId: uuid('review_id')
    .notNull()
    .references(() => reviews.id, { onDelete: 'cascade' }),
  file: text('file').notNull(),
  startLine: integer('start_line').notNull(),
  endLine: integer('end_line').notNull(),
  severity: text('severity').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  rationale: text('rationale').notNull(),
  suggestion: text('suggestion'),
  confidence: doublePrecision('confidence').notNull(),
  kind: text('kind').notNull().default('finding'),
  trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
});

/**
 * Intent Layer (L03): the derived PR intent, cached per (pr_id, head_sha,
 * inputs_hash). One row per PR — regenerating overwrites it and adds the new
 * call's cost onto `cost_usd_total`.
 */
export const prIntent = pgTable(
  'pr_intent',
  {
    prId: uuid('pr_id')
      .primaryKey()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    intent: text('intent').notNull(),
    inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** PR head SHA the intent was derived against; part of the cache key. */
    headSha: text('head_sha').notNull(),
    /** Hash of the inputs (title, body, refs, provider/model, prompt version); part of the cache key. */
    inputsHash: text('inputs_hash').notNull(),
    changeType: text('change_type').notNull().default('other'),
    confidence: text('confidence').notNull().default('low'),
    confidenceScore: doublePrecision('confidence_score').notNull().default(0),
    missingDocs: boolean('missing_docs').notNull().default(true),
    sources: jsonb('sources').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    /** Cost of the single LLM call that produced this row; null when unpriced. */
    costUsd: numeric('cost_usd').$type<number>(),
    /** Running total across every (re)generation of this PR's intent. */
    costUsdTotal: numeric('cost_usd_total').$type<number>(),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    wsIdx: index('pr_intent_ws_idx').on(t.workspaceId),
    changeTypeCheck: check(
      'pr_intent_change_type_check',
      sql`${t.changeType} in ('feature', 'bugfix', 'refactor', 'perf', 'security', 'docs', 'test', 'chore', 'deps', 'config', 'other')`,
    ),
    confidenceCheck: check('pr_intent_confidence_check', sql`${t.confidence} in ('high', 'medium', 'low')`),
    confidenceScoreCheck: check(
      'pr_intent_confidence_score_check',
      sql`${t.confidenceScore} between 0 and 1`,
    ),
    tokensInCheck: check('pr_intent_tokens_in_check', sql`${t.tokensIn} >= 0`),
    tokensOutCheck: check('pr_intent_tokens_out_check', sql`${t.tokensOut} >= 0`),
    sourcesArrayCheck: check('pr_intent_sources_array_check', sql`jsonb_typeof(${t.sources}) = 'array'`),
  }),
);

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});
