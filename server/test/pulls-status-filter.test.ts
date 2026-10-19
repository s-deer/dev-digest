import { describe, it, expect } from 'vitest';
import { PR_LIST_STATUSES } from '@devdigest/shared';
import { parseStatusFilter } from '../src/modules/pulls/status.js';
import { ValidationError } from '../src/platform/errors.js';

describe('parseStatusFilter — unfiltered', () => {
  it.each([
    ['undefined', undefined],
    ['empty string', ''],
    ['whitespace', '   '],
    ['lone comma', ','],
    ['empty + blank array', ['', ' ']],
  ])('%s -> null', (_n, raw) => {
    expect(parseStatusFilter(raw as string | string[] | undefined)).toBeNull();
  });
});

describe('parseStatusFilter — valid', () => {
  it.each([
    ['empty segment in array', ['', 'stale'], ['stale']],
    ['spaces around', ' needs_review , stale ', ['needs_review', 'stale']],
    ['double comma', 'stale,,merged', ['stale', 'merged']],
    ['leading/trailing comma', ',stale,', ['stale']],
    ['duplicate', 'stale,stale', ['stale']],
    ['repeated param', ['needs_review', 'merged'], ['needs_review', 'merged']],
    ['all five', PR_LIST_STATUSES.join(','), [...PR_LIST_STATUSES]],
  ])('%s', (_n, raw, expected) => {
    const got = parseStatusFilter(raw as string | string[]);
    expect(got).toBeInstanceOf(Set);
    expect([...got!].sort()).toEqual([...expected].sort());
  });

  it('all five gives size 5', () => {
    expect(parseStatusFilter([...PR_LIST_STATUSES].join(','))!.size).toBe(5);
  });
});

describe('parseStatusFilter — invalid', () => {
  function catchErr(raw: string | string[]): ValidationError {
    try {
      parseStatusFilter(raw);
    } catch (e) {
      return e as ValidationError;
    }
    throw new Error('expected parseStatusFilter to throw');
  }

  it.each([
    ['Stale', ['Stale']],
    ['NEEDS_REVIEW', ['NEEDS_REVIEW']],
    ['open', ['open']],
    ['stale,bogus', ['bogus']],
    ['foo,bar,foo', ['foo', 'bar']],
  ])('%s -> 422 naming %j', (raw, invalid) => {
    const err = catchErr(raw);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe('validation_error');
    expect(err.details).toEqual({ invalid, allowed: [...PR_LIST_STATUSES] });
    for (const v of invalid) expect(err.message).toContain(v);
  });

  it('echoes a hostile value only as JSON string data', () => {
    const hostile = '<script>\u0000';
    const err = catchErr(hostile);
    expect((err.details as { invalid: string[] }).invalid).toEqual([hostile]);
    expect(err.message).toContain(JSON.stringify(hostile));
  });
});
