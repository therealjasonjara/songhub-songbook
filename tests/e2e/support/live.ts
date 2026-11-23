/**
 * Live-site mode (playwright.live.config.ts): the same specs run against a real deployment. `LIVE_URL` is set only there, so in the
 * local gate (`npm run test:e2e`) `LIVE` is false and every spec behaves exactly as before.
 */
const raw = process.env.LIVE_URL?.trim();

export const LIVE: boolean = Boolean(raw);

/** The deployment's origin, no trailing slash (null in the local gate). */
export const LIVE_ORIGIN: string | null = raw ? new URL(raw).origin : null;
