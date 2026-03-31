// Offscreen document for running fiber-js WASM
// This document has COOP/COEP headers (provided by Chrome extension manifest),
// which enables SharedArrayBuffer for fiber-js WASM.

import { FiberWasmManager } from "../shared/fiber-wasm";
import { Buffer } from "buffer/";
import {
  DEFAULT_FIBER_CONFIG_PATH,
  DEFAULT_FIBER_DATABASE_PREFIX,
  DEFAULT_FIBER_SECRET_STORAGE_KEY,
} from "../config";

// Polyfills needed for WASM
if (!("global" in globalThis)) {
  (globalThis as any).global = globalThis;
}
if (!("Buffer" in globalThis)) {
  (globalThis as any).Buffer = Buffer;
}

// ─── Fiber WASM instance ────────────────────────────────────────────
const fiber = new FiberWasmManager({
  configPath: DEFAULT_FIBER_CONFIG_PATH,
  secretStorageKey: DEFAULT_FIBER_SECRET_STORAGE_KEY,
  databasePrefix: DEFAULT_FIBER_DATABASE_PREFIX,
  logLevel: "info",
});

let fiberRunning = false;
let fiberStarting = false;

async function startFiber(): Promise<void> {
  if (fiberRunning || fiberStarting) {
    console.log("[Offscreen] Fiber already running or starting, skipping");
    return;
  }

  fiberStarting = true;
  const startTime = performance.now();
  try {
    await fiber.start();
    fiberRunning = true;
    const duration = performance.now() - startTime;
    console.log(`[Offscreen] Fiber WASM started successfully (${duration.toFixed(2)}ms)`);
  } catch (err) {
    console.error("[Offscreen] Failed to start Fiber WASM:", err);
    fiberRunning = false;
    throw err;
  } finally {
    fiberStarting = false;
  }
}

// ─── Message handler ────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "offscreen-handler") return false;

  handleMessage(message)
    .then((result) => sendResponse(result))
    .catch((err) => sendResponse({ success: false, error: err.message }));
  return true;
});

async function handleMessage(message: any): Promise<any> {
  const { type, payload } = message;

  switch (type) {
    case "FIBER_HEARTBEAT":
      return { fiberRunning };

    case "FIBER_INIT":
      await startFiber();
      return { success: true, initialized: true };

    case "FIBER_CALL": {
      if (!fiberRunning) {
        await startFiber();
      }
      const { method, args } = payload;
      const fn = (fiber as any)[method];
      if (typeof fn !== "function") {
        throw new Error(`Unknown fiber method: ${method}`);
      }
      const result = await fn.apply(fiber, args || []);
      return { success: true, result };
    }

    default:
      throw new Error(`Unknown message type: ${type}`);
  }
}

// ─── Auto-start Fiber on offscreen document load ────────────────────
startFiber().catch((err) => {
  console.error("[Offscreen] Auto-start failed:", err);
});

console.log("[Fiber Wallet] Offscreen document initialized");
