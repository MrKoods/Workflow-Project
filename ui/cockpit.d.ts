import type { CockpitApi } from '../orchestrator/types';

declare global {
  interface Window {
    /** Exposed by app/preload.ts. */
    cockpit: CockpitApi;
  }
}
