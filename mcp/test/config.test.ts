import { describe, expect, it } from 'vitest';
import { DEFAULT_API_URL, loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('defaults apiUrl, disables blast radius, and sets the request timeout', () => {
    const config = loadConfig({});
    expect(config.apiUrl).toBe(DEFAULT_API_URL);
    expect(config.enableBlastRadius).toBe(false);
    expect(config.requestTimeoutMs).toBeGreaterThan(0);
  });

  it('reads DEVDIGEST_API_URL, strips a trailing slash, and enables blast radius on "1"', () => {
    const config = loadConfig({
      DEVDIGEST_API_URL: 'https://digest.internal:8443/',
      DEVDIGEST_MCP_ENABLE_BLAST_RADIUS: '1',
    });
    expect(config.apiUrl).toBe('https://digest.internal:8443');
    expect(config.enableBlastRadius).toBe(true);
  });

  it('treats any value other than "1" as blast radius disabled', () => {
    const config = loadConfig({ DEVDIGEST_MCP_ENABLE_BLAST_RADIUS: 'true' });
    expect(config.enableBlastRadius).toBe(false);
  });

  it('rejects a malformed DEVDIGEST_API_URL', () => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'not a url' })).toThrow(/not a valid URL/);
  });

  it('rejects a non-http(s) DEVDIGEST_API_URL', () => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'ftp://example.com' })).toThrow(/http or https/);
  });
});
