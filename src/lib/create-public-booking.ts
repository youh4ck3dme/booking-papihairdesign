/** Public mutation payload used by the deployed booking RPC and its legacy Edge fallback. */
export interface PublicBookingPayload {
  business_id: string;
  service_id: string;
  employee_id: string;
  start_at: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
}
export interface PublicBookingData {
  claim_token?: string;
  customer_email?: string;
  customer_name?: string;
  error?: string;
}
interface PublicBookingError { message: string; code?: string }
interface PublicBookingResponse { data: unknown; error: PublicBookingError | null }
export interface PublicBookingClient {
  rpc(name: 'create_public_booking', payload: PublicBookingPayload): PromiseLike<PublicBookingResponse>;
  functions: {
    invoke(name: 'create-public-booking', options: { body: PublicBookingPayload }): PromiseLike<PublicBookingResponse>;
  };
}

/**
 * Preserve the established production RPC-first flow. Only a missing RPC signature
 * (PGRST202) permits the legacy Edge request. Conflicts, network/permission errors
 * and application errors must never attempt a second reservation mutation.
 */
export async function createPublicBooking(client: PublicBookingClient, payload: PublicBookingPayload): Promise<{ data: PublicBookingData | null; error: PublicBookingError | null }> {
  const primary = await client.rpc('create_public_booking', payload);
  const result = primary.error?.code === 'PGRST202'
    ? await client.functions.invoke('create-public-booking', { body: payload })
    : primary;
  return { data: result.data as PublicBookingData | null, error: result.error };
}
