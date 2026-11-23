import type { Server } from 'node:http';

export interface StartServerOptions {
  port?: number;
  dir?: string;
  host?: string;
}
export interface RunningServer {
  server: Server;
  port: number;
  close: () => Promise<void>;
}
export function startServer(options?: StartServerOptions): Promise<RunningServer>;
