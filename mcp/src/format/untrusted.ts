const OPEN_TAG = '<untrusted_data>';
const CLOSE_TAG = '</untrusted_data>';

/**
 * Fences PR/LLM-derived content as data, not instructions. Any literal
 * occurrence of the closing tag inside the payload (e.g. a hostile PR title)
 * is escaped so it can't prematurely close the fence.
 */
export function wrapUntrustedJson(value: unknown): string {
  const json = JSON.stringify(value);
  const escaped = json.split(CLOSE_TAG).join('<\\/untrusted_data>');
  return `${OPEN_TAG}\n${escaped}\n${CLOSE_TAG}`;
}
