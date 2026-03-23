/**
 * Helper utilities for communicating between popup and background/offscreen
 */

export const isExtensionContext = (): boolean => {
  return typeof chrome !== "undefined" && !!chrome.runtime?.id;
};

export async function sendToBackground(message: any): Promise<any> {
  if (!isExtensionContext()) {
    throw new Error("Not in extension context");
  }
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.success === false) {
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    });
  });
}

export async function fiberApiCall(method: string, params: any, nodeUrl?: string): Promise<any> {
  if (isExtensionContext()) {
    return sendToBackground({
      type: "FIBER_API_CALL",
      payload: { method, params, url: nodeUrl }
    });
  }
  // Fallback for web mode - use direct fetch or proxy
  const response = await fetch(nodeUrl || "/fiber-api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() })
  });
  return response.json();
}
