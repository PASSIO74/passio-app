// Entrypoint du Control Center : installe l'enveloppe Autopilot AVANT que le
// serveur démarre Sentinel. Le moteur reste inchangé et le comportement de
// mutation demeure fail-closed via config.allowMutations + DASH_SENTINEL_AUTOPILOT.
import { startSentinelAutopilot } from "./sentinel-autopilot-bootstrap.js";

startSentinelAutopilot();
await import("./index.js");
