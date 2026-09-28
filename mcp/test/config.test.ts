import { describe, expect, it } from 'vitest';
import { DEFAULT_API_URL, loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('defaults apiUrl and sets the request timeout', () => {
    const config = loadConfig({});
    expect(config.apiUrl).toBe(DEFAULT_API_URL);
    expect(config.requestTimeoutMs).toBeGreaterThan(0);
  });

  it('reads DEVDIGEST_API_URL and strips a trailing slash', () => {
    const config = loadConfig({ DEVDIGEST_API_URL: 'https://digest.internal:8443/' });
    expect(config.apiUrl).toBe('https://digest.internal:8443');
  });

  it('rejects a malformed DEVDIGEST_API_URL', () => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'not a url' })).toThrow(/not a valid URL/);
  });

  it('rejects a non-http(s) DEVDIGEST_API_URL', () => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'ftp://example.com' })).toThrow(/http or https/);
  });
});
