// Shared Chrome DevTools Protocol client for the garden debug scripts.
//
// garden-drag.mjs and perf-stress.mjs each grew their own copy of this;
// perf-scenario.mjs and everything after it should import from here.
// Requires Chromium with `--remote-debugging-port=9222` and a debug build
// served with `?gardenDebug=1` (see TESTING.md).
import process from 'node:process';

/** First-frame shader compile stalls the main thread for ~2s cold; sit it out. */
const BOOT_SETTLE_MS = 8000;

/**
 * @typedef {{ send: (method: string, params?: Record<string, unknown>) => Promise<any>,
 *   evaluate: (expression: string) => Promise<any>, targetUrl: URL,
 *   waitForEvent: (method: string, timeoutMs?: number) => Promise<any> }} CDPClient
 */

/** @typedef {{ type: string, url: string, webSocketDebuggerUrl: string }} DevToolsTarget */
/** @typedef {{ resolve: (value: any) => void, reject: (reason: Error) => void }} PendingRequest */

/**
 * @param {{ cdpUrl?: string, baseUrl?: string }} [options]
 * @returns {Promise<{ socket: WebSocket, send: CDPClient['send'], evaluate: CDPClient['evaluate'], waitForEvent: CDPClient['waitForEvent'], targetUrl: URL, close: () => void }>}
 */
export async function connectCDP(options = {}) {
  const baseUrl = options.baseUrl ?? process.env.GARDEN_URL ?? 'http://127.0.0.1:8000/';
  const cdpUrl = options.cdpUrl ?? process.env.GARDEN_CDP_URL ?? 'http://127.0.0.1:9222';
  const targetUrl = new URL(baseUrl);
  targetUrl.searchParams.set('gardenDebug', '1');

  const response = await fetch(`${cdpUrl}/json/list`);
  if (!response.ok) throw new Error(`Chrome DevTools returned HTTP ${response.status}`);
  /** @type {DevToolsTarget[]} */
  const targets = await response.json();
  const pages = targets.filter((entry) => entry.type === 'page');
  const target = pages.find((entry) => {
    try {
      return new URL(entry.url).origin === targetUrl.origin;
    } catch {
      return false;
    }
  })
    ?? (pages.length === 1 && pages[0].url === 'about:blank' ? pages[0] : undefined);
  if (!target) throw new Error(`Open ${targetUrl.origin} in Chromium with remote debugging enabled.`);
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  /** @type {Map<number, PendingRequest>} */
  const pending = new Map();
  /** @param {string} reason */
  const failPending = (reason) => {
    if (!pending.size) return;
    for (const [id, request] of pending) {
      pending.delete(id);
      request.reject(new Error(`CDP connection closed before a response arrived (${reason}).`));
    }
  };
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id) {
      const waiters = eventWaiters.get(message.method);
      if (waiters) for (const waiter of waiters.splice(0)) waiter(message.params);
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  // A dropped session must fail loudly: without this, an awaited send hangs
  // forever and the runner exits silently with no output.
  socket.addEventListener('close', (event) => failPending(`close code ${event.code}`));
  socket.addEventListener('error', () => failPending('socket error'));
  /** @type {Map<string, Array<(params: any) => void>>} */
  const eventWaiters = new Map();
  /** Wait for the next pushed browser event, e.g. Page.loadEventFired.
   * @param {string} method @param {number} [timeoutMs] */
  function waitForEvent(method, timeoutMs = 30_000) {
    return new Promise((resolve, reject) => {
      const list = eventWaiters.get(method) ?? [];
      const timer = setTimeout(() => {
        eventWaiters.set(method, (eventWaiters.get(method) ?? []).filter((waiter) => waiter !== onEvent));
        reject(new Error(`Timed out waiting for ${method}.`));
      }, timeoutMs);
      /** @param {any} params */
      function onEvent(params) {
        clearTimeout(timer);
        eventWaiters.set(method, (eventWaiters.get(method) ?? []).filter((waiter) => waiter !== onEvent));
        resolve(params);
      }
      list.push(onEvent);
      eventWaiters.set(method, list);
    });
  }
  /** @param {string} method @param {Record<string, unknown>} [params] */
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    if (socket.readyState !== WebSocket.OPEN) {
      reject(new Error('CDP connection is not open.'));
      return;
    }
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    try {
      socket.send(JSON.stringify({ id, method, params }));
    } catch (error) {
      pending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
  /** @param {string} expression */
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails;
      throw new Error(detail.text ?? detail.exception?.description ?? 'Page evaluation failed');
    }
    return result.result?.value;
  }
  return { socket, send, evaluate, waitForEvent, targetUrl, close: () => socket.close() };
}

/**
 * True for transport deaths (dropped session, dead socket). Scenario and
 * page errors (failed fixtures, bad expressions) are never retried.
 * @param {unknown} error
 */
export function isConnectionError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('CDP connection closed') || message.includes('CDP connection is not open');
}

/**
 * Run body with a fresh debugger session, retrying once on a transport
 * death. Debugger sessions are expendable: the browser intermittently
 * clean-closes them (no traffic in flight, no page navigation), so a dead
 * session is reattached, never debugged. Bodies must be idempotent -- every
 * scenario expression resets its own fixtures -- and reattach never
 * re-navigates, so a load in progress simply continues.
 * @param {{ cdpUrl?: string, baseUrl?: string }} connectOptions
 * @param {(cdp: CDPClient) => Promise<any>} body
 */
export async function withSession(connectOptions, body) {
  let cdp = await connectCDP(connectOptions);
  try {
    const result = await body(cdp);
    cdp.close();
    return result;
  } catch (error) {
    if (!isConnectionError(error)) throw error;
    try { cdp.close(); } catch { /* already dead */ }
    cdp = await connectCDP(connectOptions);
    try {
      return await body(cdp);
    } finally {
      cdp.close();
    }
  }
}

/**
 * Cold first frames stall the main thread for seconds (shader compile) and
 * the browser answers by dropping the debugger session: the next send then
 * dies on a clean close. So this never evaluates during boot. When the page
 * is already warm from an earlier run it skips navigation entirely (every
 * scenario resets its own fixtures via clearGarden, and the live GL context
 * keeps its compiled shaders). Otherwise it navigates, waits for load, and
 * sits out the boot wedge with zero sends before polling for readiness.
 * @param {{ send: CDPClient['send'], evaluate: CDPClient['evaluate'], waitForEvent: CDPClient['waitForEvent'], targetUrl: URL }} cdp
 * @param {number} [timeoutMs]
 * @param {boolean} [forceReload] Navigate even when the page is already warm.
 */
export async function openDebugPage(cdp, timeoutMs = 30_000, forceReload = false) {
  await cdp.send('Page.enable');
  if (!forceReload) {
    const warm = await cdp.evaluate('window.__gardenDebug?.enabled === true').catch(() => false);
    if (warm) return;
  }
  const loaded = cdp.waitForEvent('Page.loadEventFired', timeoutMs);
  await cdp.send('Page.navigate', { url: cdp.targetUrl.href });
  await loaded;
  await new Promise((resolve) => setTimeout(resolve, BOOT_SETTLE_MS));
  const readyBy = Date.now() + timeoutMs;
  let ready = false;
  while (Date.now() < readyBy) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    ready = await cdp.evaluate('window.__gardenDebug?.enabled === true');
    if (ready) break;
  }
  if (!ready) throw new Error('Debug harness failed to initialize; use the debug dev build.');
}

/**
 * @param {{ evaluate: CDPClient['evaluate'] }} cdp
 * @param {{ minWidth?: number, maxWidth?: number, minHeight?: number, maxHeight?: number }} [options]
 *
 * Screenshots poison long agent threads (30MB re-upload cap), so every scripted
 * scenario refuses to run at unexpected sizes instead of silently measuring a
 * different scene. Keep the window at about 1280x720.
 */
export async function assertViewport(cdp, { minWidth = 1200, maxWidth = 1360, minHeight = 680, maxHeight = 760 } = {}) {
  const viewport = await cdp.evaluate('[innerWidth, innerHeight]');
  if (viewport[0] < minWidth || viewport[0] > maxWidth || viewport[1] < minHeight || viewport[1] > maxHeight) {
    throw new Error(`Refusing to measure at ${viewport[0]}x${viewport[1]}; resize to about 1280x720 first.`);
  }
  return viewport;
}

/** @param {number[]} values @param {number} fraction @returns {number | null} */
export function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

/**
 * Split the oracle: `workMs` (CPU time we spent) is meaningful everywhere
 * including CI software rendering; `intervalMs`/FPS (wall clock) is only
 * meaningful on a real GPU. Gate CI on work, read FPS locally.
 */
/**
 * @param {number[]} samples
 * @param {number[]} intervals
 */
export function summarizeTiming(samples, intervals) {
  const averageIntervalMs = intervals.reduce((sum, value) => sum + value, 0) / Math.max(1, intervals.length);
  return {
    sampleCount: samples.length,
    averageIntervalMs: intervals.length ? averageIntervalMs : null,
    sustainedFps: intervals.length ? 1000 / averageIntervalMs : null,
    p50WorkMs: percentile(samples, 0.5),
    p95WorkMs: percentile(samples, 0.95),
    maxWorkMs: percentile(samples, 1),
    p50FrameIntervalMs: percentile(intervals, 0.5),
    p95FrameIntervalMs: percentile(intervals, 0.95),
    maxFrameIntervalMs: percentile(intervals, 1),
  };
}
