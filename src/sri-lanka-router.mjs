import { DurableObject } from 'cloudflare:workers';

const PORT = 5000;
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
const PROFILE_PATHS = Object.freeze({ driving: 'driving', walking: 'walking', cycling: 'cycling' });

export class SriLankaRouter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.starting = undefined;
    if (ctx.container?.running) {
      void ctx.blockConcurrencyWhile(() => ctx.container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS));
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const profile = request.headers.get('x-mazo-routing-profile');
    const sourceHash = request.headers.get('x-mazo-routing-source');
    if (request.method !== 'GET' || !Object.hasOwn(PROFILE_PATHS, profile)
      || !/^[a-f0-9]{64}$/.test(sourceHash || '')
      || !/^\/route\/v1\/(?:driving|walking|cycling)\//.test(url.pathname)) {
      return Response.json({ error: 'invalid_router_request' }, { status: 400 });
    }
    if (!this.profile) {
      this.profile = await this.ctx.storage.get('route-profile');
      if (!this.profile) {
        await this.ctx.storage.put('route-profile', profile);
        this.profile = profile;
      }
    }
    if (this.profile !== profile) return Response.json({ error: 'router_profile_mismatch' }, { status: 409 });

    this.starting ??= this.startAndWaitForReady(profile).finally(() => { this.starting = undefined; });
    await this.starting;
    const forwarded = new Request(request);
    forwarded.headers.delete('x-mazo-routing-profile');
    forwarded.headers.delete('x-mazo-routing-source');
    const destination = new URL(forwarded.url);
    destination.protocol = 'http:';
    destination.host = 'container';
    forwarded.headers.delete('host');
    return this.ctx.container.getTcpPort(PORT).fetch(new Request(destination, forwarded));
  }

  async startAndWaitForReady(profile) {
    const container = this.ctx.container;
    const image = container.images.base;
    const previousImage = await this.ctx.storage.get('router-image');
    if (container.running && previousImage !== image) await container.destroy();
    if (!container.running) {
      container.start({
        image,
        instance: 'standard-2',
        enableInternet: false,
        env: { ROUTE_PROFILE: profile },
      });
      await this.ctx.storage.put('router-image', image);
    }
    await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);
    const port = container.getTcpPort(PORT);
    let lastError;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        const response = await port.fetch(`http://container/route/v1/${PROFILE_PATHS[profile]}/0,0;0,0?overview=false`, {
          signal: AbortSignal.timeout(1500),
        });
        await response.body?.cancel();
        // OSRM returns a JSON error for the off-island probe after its graph is
        // loaded. Any HTTP response below 500 proves the server is ready.
        if (response.status < 500) return;
        lastError = new Error(`OSRM readiness returned HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('Sri Lanka routing Container failed readiness checks', { cause: lastError });
  }
}
