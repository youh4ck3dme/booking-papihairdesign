export function revealBookingOffer(element: HTMLElement | null): void {
  if (!element) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  element.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
  if (!reducedMotion) element.animate([
    { opacity: 0.6, transform: 'translateY(14px) scale(0.985)' },
    { opacity: 1, transform: 'none' },
  ], { duration: 280, easing: 'ease-out' });
}
