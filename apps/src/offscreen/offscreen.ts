// Offscreen document for running fiber-js WASM
// This document has COOP/COEP headers set by the extension,
// allowing SharedArrayBuffer usage

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "offscreen-handler") return false;

  handleFiberMessage(message)
    .then(result => sendResponse({ success: true, result }))
    .catch(err => sendResponse({ success: false, error: err.message }));
  return true;
});

async function handleFiberMessage(message: any): Promise<any> {
  const { type, payload } = message;

  switch (type) {
    case "FIBER_INIT":
      // Initialize fiber-js WASM
      return { initialized: true };
    case "FIBER_CALL":
      // Handle fiber-js calls
      return { result: payload };
    default:
      throw new Error(`Unknown message type: ${type}`);
  }
}

console.log("[Fiber Wallet] Offscreen document initialized");
