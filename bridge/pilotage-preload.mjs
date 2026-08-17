import { McpServer } from "@modelcontextprotocol/server";
import { registerPilotageTools } from "./pilotage.mjs";

// Extension non invasive du Bridge existant : on greffe les outils Pilotage au
// premier registerTool de chaque McpServer, sans modifier server.mjs. Les appels
// Pilotage restent dans le processus Bridge ; safeEnv() de server.mjs ne transmet
// volontairement PAS PASSIO_DASHBOARD_USER/PASSWORD aux processus Claude.
const INSTALLED = Symbol.for("passio.pilotage.tools.installed");
const PATCHED = Symbol.for("passio.pilotage.preload.patched");

if (!McpServer.prototype[PATCHED]) {
  const originalRegisterTool = McpServer.prototype.registerTool;

  Object.defineProperty(McpServer.prototype, PATCHED, {
    value: true,
    enumerable: false,
    configurable: false
  });

  McpServer.prototype.registerTool = function patchedRegisterTool(...args) {
    if (!this[INSTALLED]) {
      Object.defineProperty(this, INSTALLED, {
        value: true,
        enumerable: false,
        configurable: false
      });

      // registerPilotageTools() appelle lui-meme server.registerTool(). On pose
      // donc temporairement une methode d'instance qui vise l'original afin
      // d'eviter toute recursion dans le preload.
      Object.defineProperty(this, "registerTool", {
        value: (...innerArgs) => originalRegisterTool.apply(this, innerArgs),
        writable: true,
        configurable: true
      });
      try {
        registerPilotageTools(this);
      } finally {
        delete this.registerTool;
      }
    }
    return originalRegisterTool.apply(this, args);
  };
}
