import { useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useBusiness } from '@/hooks/useBusiness';
import { supabase } from '@/integrations/supabase/client';
import { allowedEmployeeTransitions, EMPLOYEE_PAGE_SIZE, ensurePrivateWorker, type EmployeeAppointment, type EmployeeStatus } from '@/lib/employee-dashboard';

export function useEmployeeScope() {
  const { user, loading, authError } = useAuth();
  const { activeMembership } = useBusiness();
  const userId = user?.id ?? null;
  const businessId = activeMembership?.business_id ?? null;
  const permitted = activeMembership?.role === 'employee';
  const lookup = useQuery({
    queryKey: ['employee', 'scope', userId, businessId],
    enabled: !loading && !authError && Boolean(userId && businessId && permitted),
    retry: false,
    queryFn: async ({ signal }) => {
      await ensurePrivateWorker();
      const { data, error } = await supabase.from('employees').select('id')
        .eq('business_id', businessId!).eq('profile_id', userId!).eq('is_active', true)
        .limit(2).abortSignal(signal);
      if (error) throw error;
      // Multiple matching employees are ambiguous; never silently choose one.
      return data?.length === 1 ? data[0].id : null;
    },
  });
  let status: 'loading' | 'ready' | 'unassigned' | 'forbidden' | 'error';
  if (loading) status = 'loading';
  else if (authError) status = 'error';
  else if (!permitted || !businessId || !userId) status = 'forbidden';
  else if (lookup.isPending) status = 'loading';
  else if (lookup.isError) status = 'error';
  else status = lookup.data ? 'ready' : 'unassigned';
  return { userId, businessId, employeeId: lookup.data ?? null, status, error: lookup.error ?? (authError ? new Error(authError) : null), retry: () => { void lookup.refetch(); } };
}

export interface EmployeeAppointmentOptions {
  start?: string;
  end?: string;
  period?: 'upcoming' | 'history';
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  all?: boolean;
}
const SELECT = 'id,business_id,employee_id,start_at,end_at,status,updated_at,customers(full_name,phone,email),services(name_sk,price),employees(display_name)';

export function useEmployeeAppointments(options: EmployeeAppointmentOptions = {}) {
  const scope = useEmployeeScope();
  const { start, end, period, status, all = false } = options;
  const search = options.search?.trim() ?? '';
  const page = Math.max(0, options.page ?? 0);
  const pageSize = Math.min(500, Math.max(1, options.pageSize ?? EMPLOYEE_PAGE_SIZE));
  return useQuery({
    queryKey: ['employee', 'appointments', scope.userId, scope.businessId, scope.employeeId, { start, end, period, status, search, page, pageSize, all }],
    enabled: scope.status === 'ready',
    retry: false,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 10000,
    queryFn: async ({ signal }) => {
      await ensurePrivateWorker();
      const now = new Date().toISOString();
      const load = async (offset: number, size: number) => {
        // Empty aliases make the cross-table OR apply to the parent appointment,
        // while full customer/service joins remain available for rendering.
        const selection = search ? `${SELECT},csearch:customers(),ssearch:services()` : SELECT;
        let request = supabase.from('appointments').select(selection, { count: 'exact' })
          .eq('business_id', scope.businessId!).eq('employee_id', scope.employeeId!);
        if (start) request = request.gt('end_at', start);
        if (end) request = request.lt('start_at', end);
        if (period === 'upcoming') request = request.gte('end_at', now);
        if (period === 'history') request = request.lt('end_at', now);
        if (status && status !== 'all' && ['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) request = request.eq('status', status as EmployeeStatus);
        if (search) {
          // ilike values are encoded by supabase-js, not interpolated into the OR expression.
          const term = `%${search.replace(/[%_\\]/g, '\\$&')}%`;
          request = request.ilike('csearch.full_name', term).ilike('ssearch.name_sk', term).or('csearch.not.is.null,ssearch.not.is.null');
        }
        const result = await request.order('start_at', { ascending: period !== 'history' }).order('id').range(offset, offset + size - 1).abortSignal(signal);
        if (result.error) throw result.error;
        return { appointments: (result.data ?? []) as unknown as EmployeeAppointment[], total: result.count ?? result.data?.length ?? 0 };
      };
      if (!all) return load(page * pageSize, pageSize);
      const result = await load(0, 500);
      while (result.appointments.length < result.total) {
        const next = await load(result.appointments.length, 500);
        if (!next.appointments.length) break;
        result.appointments.push(...next.appointments);
        result.total = next.total;
      }
      return result;
    },
  });
}

export class EmployeeConflictError extends Error {
  constructor() { super('EMPLOYEE_CONFLICT'); this.name = 'EmployeeConflictError'; }
}
export function useEmployeeStatusUpdate() {
  const scope = useEmployeeScope();
  const client = useQueryClient();
  const currentIdentity = useRef(scope);
  currentIdentity.current = scope;
  return useMutation({
    retry: false,
    mutationFn: async ({ appointment, newStatus }: { appointment: EmployeeAppointment; newStatus: EmployeeStatus }) => {
      if (scope.status !== 'ready' || appointment.business_id !== scope.businessId || appointment.employee_id !== scope.employeeId || !allowedEmployeeTransitions(appointment.status).includes(newStatus)) {
        throw new Error('EMPLOYEE_FORBIDDEN');
      }
      await ensurePrivateWorker();
      if (currentIdentity.current.userId !== scope.userId || currentIdentity.current.businessId !== scope.businessId || currentIdentity.current.employeeId !== scope.employeeId || currentIdentity.current.status !== 'ready') throw new Error('EMPLOYEE_FORBIDDEN');
      let request = supabase.from('appointments').update({ status: newStatus })
        .eq('id', appointment.id).eq('business_id', scope.businessId!).eq('employee_id', scope.employeeId!).eq('status', appointment.status);
      if (appointment.updated_at) request = request.eq('updated_at', appointment.updated_at);
      const { data, error } = await request.select('id').maybeSingle();
      if (error) throw new Error('EMPLOYEE_UPDATE_FAILED');
      if (!data) throw new EmployeeConflictError();
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['employee', 'appointments'] }),
  });
}
