// Service worker for Fiber Wallet extension
// Manages offscreen document lifecycle and message routing

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

// Route messages between popup and offscreen document
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === "offscreen") {
    ensureOffscreenDocument().then(() => {
      chrome.runtime.sendMessage({ ...message, target: "offscreen-handler" }, sendResponse);
    });
    return true;
  }

  if (message.type === "FIBER_API_CALL") {
    // Direct API calls to the local Fiber node
    const { method, params, url } = message.payload;
    fetch(url || "http://127.0.0.1:8247", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() })
    })
      .then(res => res.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

console.log("[Fiber Wallet] Service worker initialized");
