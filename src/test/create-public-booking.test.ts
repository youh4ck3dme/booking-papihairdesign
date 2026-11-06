import { describe, expect, it, vi } from 'vitest';
import { createPublicBooking, type PublicBookingClient, type PublicBookingPayload } from '../lib/create-public-booking';

const payload: PublicBookingPayload = {
  business_id: 'fixture-business', service_id: 'fixture-service', employee_id: 'fixture-employee',
  start_at: '2026-11-07T09:45:00Z', customer_name: 'Test Client', customer_email: 'client@example.invalid',
};
function client() { return { rpc: vi.fn(), functions: { invoke: vi.fn() } }; }
describe('deployed public booking endpoint compatibility', () => {
  it('uses a successful primary RPC exactly once and never invokes Edge', async () => {
    const api = client(); const data = { customer_name: 'Test Client', claim_token: 'fixture-only' };
    api.rpc.mockResolvedValue({ data, error: null });
    expect(await createPublicBooking(api, payload)).toEqual({ data, error: null });
    expect(api.rpc).toHaveBeenCalledExactlyOnceWith('create_public_booking', payload);
    expect(api.functions.invoke).not.toHaveBeenCalled();
  });
  it('falls back once only when PostgREST explicitly reports a missing RPC signature', async () => {
    const api = client(); const data = { customer_email: 'client@example.invalid' };
    api.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Missing function signature' } });
    api.functions.invoke.mockResolvedValue({ data, error: null });
    expect(await createPublicBooking(api, payload)).toEqual({ data, error: null });
    expect(api.rpc).toHaveBeenCalledOnce();
    expect(api.functions.invoke).toHaveBeenCalledExactlyOnceWith('create-public-booking', { body: payload });
  });
  it.each(['23505', '23P01', '42501', 'PGRST301', 'NETWORK_ERROR'])('does not duplicate the mutation for error %s', async code => {
    const api = client(); const error = { code, message: 'Booking rejected' };
    api.rpc.mockResolvedValue({ data: null, error });
    expect(await createPublicBooking(api, payload)).toEqual({ data: null, error });
    expect(api.rpc).toHaveBeenCalledOnce(); expect(api.functions.invoke).not.toHaveBeenCalled();
  });
  it('preserves an RPC application conflict without a second attempt', async () => {
    const api = client(); const data = { error: 'Selected time is no longer available' };
    api.rpc.mockResolvedValue({ data, error: null });
    expect(await createPublicBooking(api, payload)).toEqual({ data, error: null });
    expect(api.functions.invoke).not.toHaveBeenCalled();
  });
  it('does not fall back when the primary request throws', async () => {
    const api = client(); api.rpc.mockRejectedValue(new Error('Network disconnected'));
    await expect(createPublicBooking(api as PublicBookingClient, payload)).rejects.toThrow('Network disconnected');
    expect(api.rpc).toHaveBeenCalledOnce(); expect(api.functions.invoke).not.toHaveBeenCalled();
  });
});
