/// Web Worker entry. Loads the dataset, builds the index and answers `EngineRequest` messages (see `engine.ts`).
/// Bundled through `new Worker(new URL('./worker.ts', import.meta.url))` in `client.ts`.
import { createEngineRunner } from './engine';
import { fetchDatasetTexts } from './fetch';
import type { EngineRequest, EngineResponse } from './protocol';

interface WorkerScope {
  postMessage: (message: EngineResponse) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent<EngineRequest>) => void) => void;
}

const scope = self as unknown as WorkerScope;

const runner = createEngineRunner({
  load: fetchDatasetTexts,
  post: (response) => scope.postMessage(response),
});

scope.addEventListener('message', (event) => runner.handle(event.data));
