import { describe, it, expect, vi, afterEach } from 'vitest';
import { revealBookingOffer } from '../lib/reveal-booking-offer';
afterEach(() => vi.unstubAllGlobals());
describe('booking offer reveal', () => {
  it('scrolls the selected offer and animates only that element', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const element = { scrollIntoView: vi.fn(), animate: vi.fn() };
    revealBookingOffer(element as unknown as HTMLElement);
    expect(element.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
    expect(element.animate).toHaveBeenCalledOnce();
  });
  it('keeps the offer reachable without animation for reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const element = { scrollIntoView: vi.fn(), animate: vi.fn() };
    revealBookingOffer(element as unknown as HTMLElement);
    expect(element.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
    expect(element.animate).not.toHaveBeenCalled();
  });
  it('ignores an offer which has not mounted', () => expect(() => revealBookingOffer(null)).not.toThrow());
});
