import { DurableObject } from 'cloudflare:workers';
import worker from './worker-core.mjs';
import { LiveDataRegistry as RegistryCore } from './live-data-registry.mjs';
import { SriLankaRouter } from './sri-lanka-router.mjs';

// Keep HTTP parsing/registry logic unit-testable in Node, while the deployed
// class uses the current Durable Object runtime base and SQLite state.
export class LiveDataRegistry extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.registry = new RegistryCore(ctx, env);
  }

  fetch(request) {
    return this.registry.fetch(request);
  }
}

export { SriLankaRouter };

export default worker;
