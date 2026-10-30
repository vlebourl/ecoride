import { setWorkerUrl } from "maplibre-gl";
import mapLibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

// MapLibre v6 ships its worker separately. Configure it before either map mounts.
setWorkerUrl(mapLibreWorkerUrl);
