import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnsureDeviceIds = vi.fn();
const mockDomoticzWebSocketUrl = vi.fn(() => 'ws://domoticz.local/json');

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances = [];

  constructor(url, protocol) {
    this.url = url;
    this.protocol = protocol;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }

  send(payload) {
    this.sent.push(payload);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    if (this.onopen) this.onopen();
  }

  message() {
    if (this.onmessage) this.onmessage({ data: '{}' });
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }
}

async function loadController({ ws = true } = {}) {
  vi.resetModules();
  vi.doMock('../scripts/config/resolveConfig.js', () => ({
    CFG: { ws },
  }));
  vi.doMock('../scripts/services/domoticzService.js', () => ({
    ensureDeviceIds: mockEnsureDeviceIds,
    domoticzWebSocketUrl: mockDomoticzWebSocketUrl,
  }));
  vi.doMock('../scripts/i18n.js', () => ({
    t: key => key,
  }));

  return import('../scripts/app/websocketController.js');
}

describe('websocketController', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    mockEnsureDeviceIds.mockReset();
    mockDomoticzWebSocketUrl.mockClear();
    mockEnsureDeviceIds.mockResolvedValue({ p1: '1', solar: '2' });
    globalThis.WebSocket = FakeWebSocket;
    globalThis.window = globalThis;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete globalThis.WebSocket;
    delete globalThis.window;
  });

  it('does not start when WebSocket mode is disabled', async () => {
    const { createWebSocketController } = await loadController({ ws: false });
    const ctrl = createWebSocketController({
      refreshAll: vi.fn(),
      setStatus: vi.fn(),
      getForecastDeviceId: () => '',
    });

    expect(ctrl.startWebSocket()).toBe(false);
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('starts once, runs open/close callbacks, and throttles push refreshes', async () => {
    let now = 10_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const { createWebSocketController } = await loadController();
    const refreshAll = vi.fn();
    const setStatus = vi.fn();
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const ctrl = createWebSocketController({
      refreshAll,
      setStatus,
      getForecastDeviceId: () => '99',
      onOpen,
      onClose,
    });

    expect(ctrl.startWebSocket()).toBe(true);
    expect(ctrl.startWebSocket()).toBe(true);
    expect(FakeWebSocket.instances).toHaveLength(1);

    const socket = FakeWebSocket.instances[0];
    socket.open();
    await Promise.resolve();

    expect(setStatus).toHaveBeenCalledWith(true, 'status-push-ok');
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(socket.sent[0]).toContain('rid=1,2,99');

    socket.message();
    socket.message();
    now += 751;
    socket.message();

    expect(refreshAll).toHaveBeenCalledTimes(2);
    expect(refreshAll).toHaveBeenNthCalledWith(1, 'ws');
    expect(refreshAll).toHaveBeenNthCalledWith(2, 'ws');

    socket.close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
