import { renderHook, act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { translateBooking, useBookingLanguage } from '../lib/booking-language';
beforeEach(() => { localStorage.clear(); window.history.replaceState({}, '', '/booking'); });
afterEach(cleanup);
describe('booking language', () => {
  it('translates step labels while preserving original SK and unknown catalog names', () => {
    expect(translateBooking('Vyberte službu', 'en')).toBe('Choose a service');
    expect(translateBooking('Vyberte službu', 'sk')).toBe('Vyberte službu');
    expect(translateBooking('Custom catalog name', 'en')).toBe('Custom catalog name');
  });
  it('honours the parent URL language and stores a subsequent choice without navigation', () => {
    window.history.replaceState({}, '', '/booking?lang=en');
    const { result } = renderHook(() => useBookingLanguage());
    expect(result.current.language).toBe('en');
    act(() => result.current.setLanguage('sk'));
    expect(document.documentElement.lang).toBe('sk');
    expect(localStorage.getItem('papi_lang')).toBe('sk');
    expect(window.location.search).toBe('?lang=en');
  });
  it('synchronizes simultaneously mounted booking and cookie controls', () => {
    const first = renderHook(() => useBookingLanguage());
    const second = renderHook(() => useBookingLanguage());
    act(() => first.result.current.setLanguage('en'));
    expect(first.result.current.language).toBe('en');
    expect(second.result.current.language).toBe('en');
  });

});
