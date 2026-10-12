import { z } from 'zod';

/**
 * English-only output.
 *
 * Cheap models (the default `deepseek-v4-flash`) drift into another language —
 * a review came back entirely in Chinese — because nothing pinned the output
 * language. Two layers:
 *
 * - `ENGLISH_ONLY_RULE` goes into every system prompt that produces
 *   human-readable text (reviews via `assemblePrompt`, brief, intent,
 *   conventions).
 * - `requireEnglish` wraps the structured-output schema with a refinement over
 *   the PROSE fields only. A non-English field fails validation, so the
 *   provider's existing reprompt-on-error loop asks the model to rewrite it.
 *   The JSON Schema sent to the provider is unchanged (refinements are not
 *   part of it).
 *
 * The check is script-based: it catches non-Latin scripts (CJK, Cyrillic,
 * Arabic, …), not other Latin-script languages — the prompt rule covers those.
 */

export const ENGLISH_ONLY_RULE =
  'LANGUAGE — write every human-readable field of your answer (summaries, titles, ' +
  'explanations, rationales, suggestions, reasons, rules, scope items) in English, ' +
  'whatever language the code, comments, PR text or other input uses. Keep code, ' +
  'identifiers, file paths and verbatim quotes exactly as they appear in the input.';

/** Below this many non-Latin letters a field is never flagged (a short quoted label). */
const MIN_FOREIGN_LETTERS = 3;
/** Share of non-Latin letters above which a field counts as non-English prose. */
const MAX_FOREIGN_SHARE = 0.2;

/** Code and quotes may legitimately carry non-English text; only prose is judged. */
function stripCodeAndQuotes(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/"[^"\n]*"/g, ' ');
}

/** True when the text reads as prose in a non-Latin-script language. */
export function isNonEnglishProse(text: string): boolean {
  const prose = stripCodeAndQuotes(text);
  const letters = prose.match(/\p{L}/gu)?.length ?? 0;
  if (letters === 0) return false;
  const latin = prose.match(/\p{Script=Latin}/gu)?.length ?? 0;
  const foreign = letters - latin;
  return foreign >= MIN_FOREIGN_LETTERS && foreign / letters > MAX_FOREIGN_SHARE;
}

/** A prose field to check: its path in the output and its value. */
export type ProseField = readonly [path: ReadonlyArray<string | number>, text: string | null | undefined];

/**
 * Refines `schema` so every field returned by `prose` must be English. Pick
 * only text the model writes itself — never verbatim evidence or code.
 */
export function requireEnglish<T>(
  schema: z.ZodType<T>,
  prose: (data: T) => ProseField[],
): z.ZodType<T> {
  return schema.superRefine((data, ctx) => {
    for (const [path, text] of prose(data)) {
      if (text && isNonEnglishProse(text)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path],
          message:
            'must be written in English. Rewrite every human-readable field in English; ' +
            'keep code, identifiers, file paths and verbatim quotes unchanged',
        });
      }
    }
  }) as z.ZodType<T>;
}
