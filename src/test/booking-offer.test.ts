import { describe, it, expect, vi, afterEach } from 'vitest';
import { revealBookingOffer } from '../lib/reveal-booking-offer';
afterEach(() => { vi.unstubAllGlobals(); document.documentElement.style.removeProperty('--papi-motion-reveal'); document.documentElement.style.removeProperty('--papi-ease'); });
describe('booking offer reveal', () => {
  it('scrolls the selected offer and animates only that element', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const element = { scrollIntoView: vi.fn(), animate: vi.fn() };
    revealBookingOffer(element as unknown as HTMLElement);
    expect(element.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
    expect(element.animate).toHaveBeenCalledOnce();
    expect(element.animate).toHaveBeenCalledWith([{ opacity: 0.6, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2, .7, .2, 1)' });
  });
  it('keeps the offer reachable without animation for reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const element = { scrollIntoView: vi.fn(), animate: vi.fn() };
    revealBookingOffer(element as unknown as HTMLElement);
    expect(element.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
    expect(element.animate).not.toHaveBeenCalled();
  });
  it('uses the shared CSS timing without retaining a transform after completion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    document.documentElement.style.setProperty('--papi-motion-reveal', '0.2s');
    document.documentElement.style.setProperty('--papi-ease', 'ease-out');
    const element = { scrollIntoView: vi.fn(), animate: vi.fn() };
    revealBookingOffer(element as unknown as HTMLElement);
    expect(element.animate.mock.calls[0][1]).toEqual({ duration: 200, easing: 'ease-out' });
    expect(element.animate.mock.calls[0][0].at(-1).transform).toBe('none');
  });
  it('ignores an offer which has not mounted', () => expect(() => revealBookingOffer(null)).not.toThrow());
});
