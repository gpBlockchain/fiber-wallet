// Service worker for Fiber Wallet extension
// Manages offscreen document lifecycle, message routing, and keep-alive

const FIBER_NODE_URL = "http://127.0.0.1:8247";
const KEEP_ALIVE_ALARM_NAME = "fiber-keep-alive";
const KEEP_ALIVE_INTERVAL_MINUTES = 0.4; // ~24 seconds (below 30s SW termination threshold)

let offscreenCreated = false;

// ─── Keep-alive via chrome.alarms ───────────────────────────────────
chrome.alarms.create(KEEP_ALIVE_ALARM_NAME, {
  periodInMinutes: KEEP_ALIVE_INTERVAL_MINUTES,
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== KEEP_ALIVE_ALARM_NAME) return;

  console.log("[Fiber Wallet] Keep-alive alarm fired");

  // Ensure offscreen document is alive and Fiber is running
  try {
    await ensureOffscreenDocument();
    // Send heartbeat to offscreen to verify Fiber is alive
    chrome.runtime.sendMessage(
      { target: "offscreen-handler", type: "FIBER_HEARTBEAT" },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn(
            "[Fiber Wallet] Heartbeat failed, offscreen may be dead. Recreating...",
            chrome.runtime.lastError.message
          );
          offscreenCreated = false;
          ensureOffscreenDocument().catch((e) =>
            console.error("[Fiber Wallet] Failed to recreate offscreen document:", e)
          );
        } else if (response && !response.fiberRunning) {
          console.warn("[Fiber Wallet] Fiber not running in offscreen, requesting restart...");
          chrome.runtime.sendMessage(
            { target: "offscreen-handler", type: "FIBER_INIT" },
            () => {}
          );
        } else {
          console.log("[Fiber Wallet] Heartbeat OK, Fiber is running");
        }
      }
    );
  } catch (err) {
    console.error("[Fiber Wallet] Keep-alive error:", err);
    offscreenCreated = false;
  }
});

// ─── Offscreen document management ──────────────────────────────────
async function ensureOffscreenDocument() {
  if (offscreenCreated) return;

  // Check if an offscreen document already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });

  if (existingContexts.length > 0) {
    offscreenCreated = true;
    return;
  }

  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["WORKERS"],
      justification: "Run fiber-js WASM with SharedArrayBuffer support",
    });
    offscreenCreated = true;
    console.log("[Fiber Wallet] Offscreen document created");
  } catch (e: any) {
    if (e.message?.includes("already exists")) {
      offscreenCreated = true;
    } else {
      throw e;
    }
  }
}

// ─── JSON-RPC helper ────────────────────────────────────────────────
async function fiberRpcCall(method: string, params: unknown, url?: string): Promise<unknown> {
  const response = await fetch(url || FIBER_NODE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() }),
  });
  return response.json();
}

// ─── Message routing ────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === "offscreen") {
    ensureOffscreenDocument().then(() => {
      chrome.runtime.sendMessage({ ...message, target: "offscreen-handler" }, sendResponse);
    });
    return true;
  }

  // Direct API calls from popup / extension pages
  if (message.type === "FIBER_API_CALL") {
    const { method, params, url } = message.payload;
    fiberRpcCall(method, params, url)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Provider requests from content scripts (injected window.fiber)
  if (message.type === "FIBER_PROVIDER_REQUEST") {
    const { method, params } = message.payload;

    // Handle built-in "ping" to check connectivity
    if (method === "ping") {
      sendResponse({ success: true, result: { pong: true } });
      return true;
    }

    fiberRpcCall(method, params)
      .then((raw: unknown) => {
        const data = raw as { result?: unknown; error?: { message?: string } } | undefined;
        if (data?.error) {
          sendResponse({
            success: false,
            error: data.error.message || JSON.stringify(data.error),
          });
        } else {
          sendResponse({ success: true, result: data?.result });
        }
      })
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// ─── Startup: create offscreen + init Fiber immediately ─────────────
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[Fiber Wallet] Extension installed/updated, starting Fiber...");
  await ensureOffscreenDocument();
  chrome.runtime.sendMessage({ target: "offscreen-handler", type: "FIBER_INIT" }, () => {
    if (chrome.runtime.lastError) {
      console.warn("[Fiber Wallet] Init message failed:", chrome.runtime.lastError.message);
    }
  });
});

chrome.runtime.onStartup.addListener(async () => {
  console.log("[Fiber Wallet] Browser started, starting Fiber...");
  await ensureOffscreenDocument();
  chrome.runtime.sendMessage({ target: "offscreen-handler", type: "FIBER_INIT" }, () => {
    if (chrome.runtime.lastError) {
      console.warn("[Fiber Wallet] Init message failed:", chrome.runtime.lastError.message);
    }
  });
});

console.log("[Fiber Wallet] Service worker initialized");
