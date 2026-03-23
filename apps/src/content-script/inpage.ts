/**
 * Inpage provider script — injected into every web page's main world.
 * Creates `window.fiber` with a MetaMask-like provider API that communicates
 * with the Fiber Wallet extension via window.postMessage ↔ content-script bridge.
 */

interface FiberProviderRequest {
  type: "FIBER_WALLET_REQUEST";
  id: number;
  method: string;
  params: unknown;
}

interface FiberProviderResponse {
  type: "FIBER_WALLET_RESPONSE";
  id: number;
  result?: unknown;
  error?: string;
}

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

const FIBER_PROVIDER_NAME = "Fiber Wallet";
const pendingRequests = new Map<number, PendingRequest>();
let requestId = 0;

function sendRequest(method: string, params: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    pendingRequests.set(id, { resolve, reject });

    const message: FiberProviderRequest = {
      type: "FIBER_WALLET_REQUEST",
      id,
      method,
      params,
    };

    window.postMessage(message, "*");
  });
}

// Listen for responses from the content script
window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;

  const data = event.data as FiberProviderResponse;
  if (data?.type !== "FIBER_WALLET_RESPONSE") return;

  const pending = pendingRequests.get(data.id);
  if (!pending) return;

  pendingRequests.delete(data.id);

  if (data.error) {
    pending.reject(new Error(data.error));
  } else {
    pending.resolve(data.result);
  }
});

/**
 * The `window.fiber` provider object — similar to MetaMask's `window.ethereum`.
 *
 * Usage from any web page:
 *   await window.fiber.listChannels()
 *   await window.fiber.parseInvoice("fibt...")
 *   await window.fiber.sendPayment({ invoice: "fibt..." })
 *   await window.fiber.request({ method: "list_channels", params: {} })
 */
const fiberProvider = {
  isFiberWallet: true,
  providerName: FIBER_PROVIDER_NAME,

  /**
   * Generic RPC request — call any Fiber JSON-RPC method.
   * Similar to MetaMask's `ethereum.request({ method, params })`.
   */
  request(args: { method: string; params?: unknown }): Promise<unknown> {
    return sendRequest(args.method, args.params ?? {});
  },

  /** Check if the Fiber Wallet extension is reachable */
  async isConnected(): Promise<boolean> {
    try {
      await sendRequest("ping", {});
      return true;
    } catch {
      return false;
    }
  },

  // ─── Convenience methods (map to Fiber JSON-RPC) ───

  listChannels(): Promise<unknown> {
    return sendRequest("list_channels", {});
  },

  getChannelInfo(channelId: string): Promise<unknown> {
    return sendRequest("list_channels", { channel_id: channelId });
  },

  parseInvoice(invoice: string): Promise<unknown> {
    return sendRequest("parse_invoice", { invoice });
  },

  newInvoice(params: Record<string, unknown>): Promise<unknown> {
    return sendRequest("new_invoice", params);
  },

  getInvoice(params: Record<string, unknown>): Promise<unknown> {
    return sendRequest("get_invoice", params);
  },

  sendPayment(params: Record<string, unknown>): Promise<unknown> {
    return sendRequest("send_payment", params);
  },

  getPayment(params: Record<string, unknown>): Promise<unknown> {
    return sendRequest("get_payment", params);
  },

  listPeers(): Promise<unknown> {
    return sendRequest("list_peers", {});
  },

  connectPeer(params: Record<string, unknown>): Promise<unknown> {
    return sendRequest("connect_peer", params);
  },

  shutdownChannel(params: Record<string, unknown>): Promise<unknown> {
    return sendRequest("shutdown_channel", params);
  },
};

// Freeze to prevent tampering
Object.freeze(fiberProvider);
(window as any).fiber = fiberProvider;

// Dispatch an event to notify the page that the provider is available
window.dispatchEvent(new Event("fiber#initialized"));

console.log("[Fiber Wallet] Provider injected into page as window.fiber");
