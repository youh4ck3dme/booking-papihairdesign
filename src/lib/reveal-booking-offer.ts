export function revealBookingOffer(element: HTMLElement | null): void {
  if (!element) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  element.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
  if (reducedMotion) return;
  const tokens = getComputedStyle(document.documentElement);
  const timing = tokens.getPropertyValue('--papi-motion-reveal').trim();
  const duration = timing.endsWith('ms') ? Number.parseFloat(timing) : timing.endsWith('s') ? Number.parseFloat(timing) * 1000 : 320;
  const easing = tokens.getPropertyValue('--papi-ease').trim() || 'cubic-bezier(.2, .7, .2, 1)';
  element.animate([
    { opacity: 0.6, transform: 'translateY(8px)' },
    { opacity: 1, transform: 'none' },
  ], { duration: Number.isFinite(duration) ? duration : 320, easing });
}
