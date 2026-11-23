import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDatasetTexts } from '../../src/lib/search/fetch';
import { DATA_URLS } from '../../src/lib/search/protocol';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status = 200) {
  const calls: Array<{ url: string; cache: RequestCache | undefined }> = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, cache: init?.cache });
    return new Response('{}', { status });
  });
  return calls;
}

describe('dataset fetch (worker and main-thread fallback)', () => {
  it('uses the normal HTTP cache on the first load', async () => {
    const calls = stubFetch();
    await fetchDatasetTexts(false);
    expect(calls.map((c) => c.url).sort()).toEqual([DATA_URLS.artists, DATA_URLS.songs].sort());
    expect(calls.map((c) => c.cache)).toEqual(['default', 'default']);
  });
  it('bypasses the HTTP cache for both files on a retry (cache: reload)', async () => {
    const calls = stubFetch();
    await fetchDatasetTexts(true);
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.cache)).toEqual(['reload', 'reload']);
  });
  it('rejects on an HTTP error', async () => {
    stubFetch(503);
    await expect(fetchDatasetTexts(false)).rejects.toThrow(/HTTP 503/);
  });
});
