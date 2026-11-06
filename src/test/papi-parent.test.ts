import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isPapiParentMessage, notifyPapiParent } from '../lib/papi-parent';
import { resolvePapiWebsiteUrl } from '../lib/public-integration-config';
import { usePapiHost } from '../lib/use-papi-host';

let frame: HTMLIFrameElement;
let host: Window;
beforeEach(() => {
  frame = document.createElement('iframe'); document.body.append(frame); host = frame.contentWindow!;
  vi.stubGlobal('parent', host);
  vi.spyOn(document, 'referrer', 'get').mockReturnValue('https://papihairdesign.sk/booking');
  vi.spyOn(host, 'postMessage').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); frame.remove(); });

it('uses a stable production homepage and validates explicit preview configuration', () => {
  expect(resolvePapiWebsiteUrl()).toBe('https://papihairdesign.sk/');
  expect(resolvePapiWebsiteUrl('https://preview.example/')).toBe('https://preview.example/');
  expect(resolvePapiWebsiteUrl('http://127.0.0.1:4396/')).toBe('http://127.0.0.1:4396/');
  for (const url of ['javascript:alert(1)', 'http://public.example/', 'https://user:secret@example.com/', 'https://example.com/?next=evil', 'https://example.com/admin']) expect(() => resolvePapiWebsiteUrl(url)).toThrow();
});
it('sends only to the exact configured parent origin and never to a wildcard', () => {
  expect(notifyPapiParent({ type: 'papi:navigate-home' })).toBe(true);
  expect(host.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'papi:navigate-home' }, 'https://papihairdesign.sk');
});
it('does not notify an untrusted or missing referrer or a standalone window', () => {
  for (const referrer of ['https://papihairdesign.sk.attacker.invalid/', '', 'not a URL']) {
    vi.spyOn(document, 'referrer', 'get').mockReturnValue(referrer);
    expect(notifyPapiParent({ type: 'papi:navigate-home' })).toBe(false);
  }
  vi.stubGlobal('parent', window);
  expect(notifyPapiParent({ type: 'papi:navigate-home' })).toBe(false);
  expect(host.postMessage).not.toHaveBeenCalled();
});
it('requires both the parent window and its exact origin for protocol readiness', () => {
  const { result } = renderHook(() => usePapiHost());
  expect(host.postMessage).toHaveBeenCalledWith({ type: 'papi:host-request' }, 'https://papihairdesign.sk');
  const ready = { type: 'papi:host-ready' };
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://attacker.invalid', source: host, data: ready }));
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://papihairdesign.sk', source: window, data: ready }));
  });
  expect(result.current).toBe(false);
  expect(isPapiParentMessage(new MessageEvent('message', { origin: 'https://papihairdesign.sk', source: window }))).toBe(false);
  act(() => window.dispatchEvent(new MessageEvent('message', { origin: 'https://papihairdesign.sk', source: host, data: ready })));
  expect(result.current).toBe(true);
});
