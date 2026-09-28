import { describe, expect, it } from 'vitest';
import { toRunStatus } from '../src/modules/reviews/helpers.js';

describe('toRunStatus', () => {
  it('passes known statuses through unchanged', () => {
    expect(toRunStatus('running')).toBe('running');
    expect(toRunStatus('done')).toBe('done');
    expect(toRunStatus('failed')).toBe('failed');
    expect(toRunStatus('cancelled')).toBe('cancelled');
  });

  it('falls back to failed for null or an unrecognized value', () => {
    expect(toRunStatus(null)).toBe('failed');
    expect(toRunStatus('bogus')).toBe('failed');
    expect(toRunStatus('')).toBe('failed');
  });
});
