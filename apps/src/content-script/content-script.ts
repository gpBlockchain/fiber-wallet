/**
 * Content script — bridge between the inpage provider (window.fiber) and the
 * extension service worker.
 *
 * Flow: web page ⇄ window.postMessage ⇄ content-script ⇄ chrome.runtime.sendMessage ⇄ service worker
 */

// Inject the inpage provider script into the page's main world
function injectInpageScript() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("inpage.js");
  script.type = "module";
  (document.head || document.documentElement).appendChild(script);
  script.onload = () => script.remove();
}

injectInpageScript();

// Listen for requests from the inpage provider and forward to the service worker
window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;
  if (event.data?.type !== "FIBER_WALLET_REQUEST") return;

  const { id, method, params } = event.data;

  chrome.runtime.sendMessage(
    {
      type: "FIBER_PROVIDER_REQUEST",
      payload: { id, method, params },
    },
    (response) => {
      const message: {
        type: string;
        id: number;
        result?: unknown;
        error?: string;
      } = {
        type: "FIBER_WALLET_RESPONSE",
        id,
      };

      if (chrome.runtime.lastError) {
        message.error = chrome.runtime.lastError.message ?? "Extension communication error";
      } else if (response?.success === false) {
        message.error = response.error ?? "Unknown error";
      } else {
        message.result = response?.data ?? response?.result;
      }

      window.postMessage(message, "*");
    }
  );
});
