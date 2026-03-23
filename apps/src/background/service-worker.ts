// Service worker for Fiber Wallet extension
// Manages offscreen document lifecycle and message routing

const FIBER_NODE_URL = "http://127.0.0.1:8247";

let offscreenCreated = false;

async function ensureOffscreenDocument() {
  if (offscreenCreated) return;

  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["WORKERS"],
      justification: "Run fiber-js WASM with SharedArrayBuffer support"
    });
    offscreenCreated = true;
  } catch (e: any) {
    if (!e.message?.includes("already exists")) {
      throw e;
    }
    offscreenCreated = true;
  }
}

/**
 * Make a JSON-RPC call to the local Fiber node.
 */
async function fiberRpcCall(method: string, params: unknown, url?: string): Promise<unknown> {
  const response = await fetch(url || FIBER_NODE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() }),
  });
  return response.json();
}

// Route messages between popup, content scripts, and offscreen document
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
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Provider requests from content scripts (injected window.fiber)
  if (message.type === "FIBER_PROVIDER_REQUEST") {
    const { id, method, params } = message.payload;

    // Handle built-in "ping" to check connectivity
    if (method === "ping") {
      sendResponse({ success: true, result: { pong: true } });
      return true;
    }

    fiberRpcCall(method, params)
      .then((raw: unknown) => {
        const data = raw as { result?: unknown; error?: { message?: string } } | undefined;
        if (data?.error) {
          sendResponse({ success: false, error: data.error.message || JSON.stringify(data.error) });
        } else {
          sendResponse({ success: true, result: data?.result });
        }
      })
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

console.log("[Fiber Wallet] Service worker initialized");
