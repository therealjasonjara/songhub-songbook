import { createHash } from 'node:crypto';

/** First 16 hex of sha256 over the songs payload and the artists payload (canonical JSON, no id): equal content, equal id. */
export function contentId(songsPayload: string, artistsPayload: string): string {
  return createHash('sha256').update(songsPayload).update('\n').update(artistsPayload).digest('hex').slice(0, 16);
}
