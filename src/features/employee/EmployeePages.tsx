import { useEffect, useRef, useState, type RefObject } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Loader2, RefreshCw, Search, Phone, Mail, CalendarCheck2, ArrowUpRight } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useEmployeeScope, useEmployeeAppointments, useEmployeeStatusUpdate } from '@/hooks/useEmployeeDashboard';
import { salonDateKey, salonDayRange, salonTime, EMPLOYEE_PAGE_SIZE, type EmployeeAppointment, type EmployeeStatus } from '@/lib/employee-dashboard';
import { useEmployeeText } from './text';
import { appointmentOverlapsRange } from './calendar';
import './employee.css';

const statusText: Record<EmployeeStatus, string> = { pending: 'Čaká na potvrdenie', confirmed: 'Potvrdená', cancelled: 'Zrušená', completed: 'Dokončená' };
function shiftDay(key: string, days: number) { const date = new Date(`${key}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function monday(key: string) { const day = new Date(`${key}T12:00:00Z`).getUTCDay(); return shiftDay(key, -(day === 0 ? 6 : day - 1)); }
function useClock() { const [now, setNow] = useState(() => new Date()); useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(timer); }, []); return now; }
function useDesktop() { const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches); useEffect(() => { const query = window.matchMedia('(min-width: 768px)'); const update = () => setDesktop(query.matches); query.addEventListener('change', update); return () => query.removeEventListener('change', update); }, []); return desktop; }
function useOnline() { const [online, setOnline] = useState(navigator.onLine); useEffect(() => { const update = () => setOnline(navigator.onLine); window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); }; }, []); return online; }
function useAppointmentSelection() {
  const [selected, setSelected] = useState<EmployeeAppointment | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const select = (appointment: EmployeeAppointment | null) => {
    if (appointment) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelected(appointment);
  };
  return { selected, setSelected: select, returnFocus };
}

function useDateFormat() { const { language } = useEmployeeText(); return (date: Date | string, options: Intl.DateTimeFormatOptions = {}) => new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'sk-SK', { timeZone: 'Europe/Bratislava', ...options }).format(typeof date === 'string' ? new Date(date) : date); }

function StatusBadge({ status }: { status: EmployeeStatus }) { const { t } = useEmployeeText(); return <span className={`employee-status employee-status-${status}`}>{t(statusText[status])}</span>; }

function ScopeBoundary({ children }: { children: React.ReactNode }) {
  const scope = useEmployeeScope(); const { t } = useEmployeeText();
  if (scope.status === 'loading') return <div className="employee-state" role="status"><Loader2 className="animate-spin" aria-hidden="true" /><p>{t('Pripravujem bezpečné pripojenie…')}</p></div>;
  if (scope.status !== 'ready') return <section className="employee-state" role={scope.status === 'error' ? 'alert' : undefined}>
    <CalendarDays size={32} aria-hidden="true" />
    <h2>{t(scope.status === 'unassigned' ? 'Váš účet nie je prepojený so zamestnancom.' : scope.status === 'forbidden' ? 'Do tejto časti nemáte prístup.' : 'Rezervácie sa nepodarilo načítať')}</h2>
    <p>{t(scope.status === 'error' ? 'Skontrolujte pripojenie a skúste to znova.' : 'Kontaktujte správcu salónu.')}</p>
    {scope.status === 'error' && <button className="employee-secondary" type="button" onClick={scope.retry}>{t('Skúsiť znova')}</button>}
  </section>;
  return children;
}

function AppointmentButton({ appointment, onSelect, showDate = false }: { appointment: EmployeeAppointment; onSelect: (appointment: EmployeeAppointment) => void; showDate?: boolean }) {
  const { t, language } = useEmployeeText(); const dateFormat = useDateFormat();
  const customer = appointment.customers?.full_name || t('Neznámy klient');
  const service = language === 'en' && appointment.services?.name_en ? appointment.services.name_en : appointment.services?.name_sk || t('Bez názvu služby');
  return <button type="button" className="employee-appointment" data-testid={`appointment-${appointment.id}`} aria-label={`${t('Detail rezervácie')}: ${customer}, ${salonTime(appointment.start_at)}`} onClick={event => { event.currentTarget.focus(); onSelect(appointment); }}>
    <span className="employee-appointment-time">{showDate && <span>{dateFormat(appointment.start_at, { day: 'numeric', month: 'short' })}</span>}<strong>{salonTime(appointment.start_at)}</strong><span>{salonTime(appointment.end_at)}</span></span>
    <span className="employee-appointment-copy"><strong>{customer}</strong><span>{service}</span><StatusBadge status={appointment.status} /></span>
    <ArrowUpRight size={18} className="employee-row-arrow" aria-hidden="true" />
  </button>;
}

function AppointmentDetail({ appointment, onClose, returnFocus }: { appointment: EmployeeAppointment | null; onClose: () => void; returnFocus: RefObject<HTMLElement> }) {
  const { t, language } = useEmployeeText(); const dateFormat = useDateFormat(); const mutation = useEmployeeStatusUpdate();
  const [cancelOpen, setCancelOpen] = useState(false); const [failure, setFailure] = useState(false);
  const [failedConflict, setFailedConflict] = useState(false);
  useEffect(() => { setFailure(false); setFailedConflict(false); setCancelOpen(false); }, [appointment?.id]);
  async function update(newStatus: EmployeeStatus) {
    if (!appointment) return; setFailure(false); setFailedConflict(false);
    try { await mutation.mutateAsync({ appointment, newStatus }); setCancelOpen(false); onClose(); }
    catch (error) { setFailure(true); setFailedConflict(error instanceof Error && error.message.includes('CONFLICT')); setCancelOpen(false); }
  }
  return <Dialog open={!!appointment} onOpenChange={open => { if (!open && !mutation.isPending) onClose(); }}>
    <DialogContent className="employee-detail" onCloseAutoFocus={event => { event.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true }); else document.getElementById('employee-main')?.focus(); }} onEscapeKeyDown={event => { if (mutation.isPending) event.preventDefault(); }} onPointerDownOutside={event => { if (mutation.isPending) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>{t('Detail rezervácie')}</DialogTitle><DialogDescription>{appointment ? dateFormat(appointment.start_at, { weekday: 'long', day: 'numeric', month: 'long' }) : ''}</DialogDescription></DialogHeader>
      {appointment && <>
        <div className="employee-detail-person"><div className="employee-avatar" aria-hidden="true">{(appointment.customers?.full_name || '?').trim().slice(0, 1).toUpperCase()}</div><div><p className="employee-person-name">{appointment.customers?.full_name || t('Neznámy klient')}</p><StatusBadge status={appointment.status} /></div></div>
        <dl className="employee-detail-fields"><div><dt><CalendarCheck2 size={18} aria-hidden="true" /><span className="sr-only">{t('Rezervácie')}</span></dt><dd>{language === 'en' && appointment.services?.name_en ? appointment.services.name_en : appointment.services?.name_sk || t('Bez názvu služby')}</dd></div><div><dt><Clock3 size={18} aria-hidden="true" /><span className="sr-only">{t('Dnes')}</span></dt><dd>{salonTime(appointment.start_at)} – {salonTime(appointment.end_at)}</dd></div></dl>
        <div className="employee-contact-links">
          {appointment.customers?.phone && <a href={`tel:${appointment.customers.phone}`}><Phone size={17} aria-hidden="true" />{t('Telefonovať klientovi')}</a>}
          {appointment.customers?.email && <a href={`mailto:${appointment.customers.email}`}><Mail size={17} aria-hidden="true" />{t('Napísať klientovi')}</a>}
        </div>
        {failure && <p className="employee-inline-error" role="alert">{t(failedConflict ? 'Rezervácia sa medzičasom zmenila. Obnovte prehľad.' : 'Zmenu sa nepodarilo uložiť. Skúste znova.')}</p>}
        <div className="employee-detail-actions" aria-busy={mutation.isPending}>
          {appointment.status === 'pending' && <button type="button" className="employee-primary" disabled={mutation.isPending} onClick={() => void update('confirmed')}><Check size={17} aria-hidden="true" />{t(mutation.isPending ? 'Ukladám…' : 'Potvrdiť')}</button>}
          {appointment.status === 'confirmed' && <button type="button" className="employee-primary" disabled={mutation.isPending} onClick={() => void update('completed')}><Check size={17} aria-hidden="true" />{t(mutation.isPending ? 'Ukladám…' : 'Dokončiť')}</button>}
          {(appointment.status === 'pending' || appointment.status === 'confirmed') ? <button type="button" className="employee-secondary employee-cancel" disabled={mutation.isPending} onClick={() => setCancelOpen(true)}>{t('Zrušiť rezerváciu')}</button> : <p className="employee-muted">{t('Tento termín už nie je možné meniť.')}</p>}
        </div>
        <AlertDialog open={cancelOpen} onOpenChange={open => { if (!mutation.isPending) setCancelOpen(open); }}><AlertDialogContent className="employee-cancel-dialog"><AlertDialogHeader><AlertDialogTitle>{t('Zrušiť túto rezerváciu?')}</AlertDialogTitle><AlertDialogDescription>{t('Klientov termín bude označený ako zrušený. Tento krok nie je možné v tomto prehľade vrátiť.')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={mutation.isPending}>{t('Ponechať rezerváciu')}</AlertDialogCancel><AlertDialogAction disabled={mutation.isPending} onClick={event => { event.preventDefault(); void update('cancelled'); }}>{t(mutation.isPending ? 'Ukladám…' : 'Áno, zrušiť')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      </>}
    </DialogContent>
  </Dialog>;
}

function QueryState({ pending, error, empty, retry }: { pending: boolean; error: boolean; empty: boolean; retry: () => void }) {
  const { t } = useEmployeeText(); const online = useOnline();
  if (!online) return <div className="employee-state" role="status"><p>{t('Ste offline. Osobné rezervácie sa neukladajú do zariadenia.')}</p></div>;
  if (error) return <div className="employee-state" role="alert"><h2>{t('Rezervácie sa nepodarilo načítať')}</h2><p>{t('Skontrolujte pripojenie a skúste to znova.')}</p><button type="button" className="employee-secondary" onClick={retry}>{t('Skúsiť znova')}</button></div>;
  if (pending) return <div className="employee-state" role="status"><Loader2 className="animate-spin" aria-hidden="true" /><p>{t('Načítavam rezervácie…')}</p></div>;
  if (empty) return <div className="employee-state"><CalendarDays size={30} aria-hidden="true" /><p>{t('Žiadne rezervácie v tomto období.')}</p></div>;
  return null;
}

function PageHeading({ title, refresh, busy, description }: { title: string; refresh: () => void; busy: boolean; description?: string }) {
  const { t } = useEmployeeText();
  return <div className="employee-page-heading"><div><p className="employee-eyebrow">PAPI HAIR DESIGN</p><h1>{t(title)}</h1>{description && <p className="employee-muted">{description}</p>}</div><button type="button" className="employee-icon-button" aria-label={t('Obnoviť rezervácie')} disabled={busy} onClick={refresh}><RefreshCw size={19} aria-hidden="true" /></button></div>;
}

function TodayContent() {
  const now = useClock(); const day = salonDateKey(now); const range = salonDayRange(day); const { t, language } = useEmployeeText(); const dateFormat = useDateFormat();
  const query = useEmployeeAppointments({ ...range, all: true }); const { selected, setSelected, returnFocus } = useAppointmentSelection(); const online = useOnline();
  const appointments = query.data?.appointments ?? []; const active = appointments.filter(a => a.status === 'pending' || a.status === 'confirmed');
  const next = active.find(a => new Date(a.end_at) > now); const canShow = online && !query.isError && !query.isPending;
  return <><PageHeading title="Dnes" description={dateFormat(now, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} refresh={() => void query.refetch()} busy={query.isFetching} />
    {canShow && <><p className="employee-welcome">{t('Vitajte vo svojom pracovnom dni.')}</p><section className="employee-metrics" aria-label={t('Dnes')}>
      <div className="employee-metric"><div className="employee-metric-icon"><CalendarDays size={20} aria-hidden="true" /></div><p>{t('Aktívne termíny')}</p><strong>{active.length}</strong></div>
      <div className="employee-metric"><div className="employee-metric-icon"><Check size={20} aria-hidden="true" /></div><p>{t('Dokončené')}</p><strong>{appointments.filter(a => a.status === 'completed').length}</strong></div>
    </section><section className="employee-next"><div><p className="employee-eyebrow">{t('Najbližší termín')}</p>{next ? <><strong>{salonTime(next.start_at)} · {next.customers?.full_name || t('Neznámy klient')}</strong><p>{language === 'en' && next.services?.name_en ? next.services.name_en : next.services?.name_sk || t('Bez názvu služby')}</p></> : <strong>{t('Žiadny ďalší termín')}</strong>}</div>{next && <button type="button" className="employee-icon-button" aria-label={`${t('Detail rezervácie')}: ${next.customers?.full_name || t('Neznámy klient')}`} onClick={event => { event.currentTarget.focus(); setSelected(next); }}><ArrowUpRight size={21} aria-hidden="true" /></button>}</section></>}
    <section className="employee-list-section"><h2>{t('Dnešné rezervácie')}</h2><QueryState pending={query.isPending} error={query.isError} empty={appointments.length === 0} retry={() => void query.refetch()} />{canShow && <div className="employee-appointment-list">{appointments.map(a => <AppointmentButton key={a.id} appointment={a} onSelect={setSelected} />)}</div>}</section>
    <AppointmentDetail appointment={online ? selected : null} onClose={() => setSelected(null)} returnFocus={returnFocus} /></>;
}

function CalendarContent() {
  const { t } = useEmployeeText(); const now = useClock(); const desktop = useDesktop(); const dateFormat = useDateFormat(); const [day, setDay] = useState(() => salonDateKey(new Date())); const { selected, setSelected, returnFocus } = useAppointmentSelection(); const online = useOnline();
  const startDay = desktop ? monday(day) : day; const days = Array.from({ length: desktop ? 7 : 1 }, (_, i) => shiftDay(startDay, i));
  const query = useEmployeeAppointments({ start: salonDayRange(startDay).start, end: salonDayRange(shiftDay(startDay, days.length)).start, all: true }); const appointments = query.data?.appointments ?? [];
  const shift = (amount: number) => setDay(current => shiftDay(current, amount)); const canShow = online && !query.isPending && !query.isError;
  return <><PageHeading title="Môj kalendár" refresh={() => void query.refetch()} busy={query.isFetching} />
    <div className="employee-calendar-toolbar"><div className="employee-date-nav"><button type="button" className="employee-icon-button" aria-label={t(desktop ? 'Predchádzajúci týždeň' : 'Predchádzajúci deň')} onClick={() => shift(desktop ? -7 : -1)}><ChevronLeft size={20} aria-hidden="true" /></button><button type="button" className="employee-secondary" onClick={() => setDay(salonDateKey(now))}>{t('Dnes')}</button><button type="button" className="employee-icon-button" aria-label={t(desktop ? 'Nasledujúci týždeň' : 'Nasledujúci deň')} onClick={() => shift(desktop ? 7 : 1)}><ChevronRight size={20} aria-hidden="true" /></button></div><label className="employee-date-label"><span>{t('Vybrať dátum')}</span><input aria-label={t('Vybrať dátum')} type="date" value={day} onChange={event => { if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) setDay(event.target.value); }} /></label></div>
    <p className="employee-muted employee-timezone">{t('Všetky časy sú v časovom pásme salónu Europe/Bratislava.')}</p>
    <QueryState pending={query.isPending} error={query.isError} empty={!desktop && appointments.length === 0} retry={() => void query.refetch()} />
    {canShow && <div className={desktop ? 'employee-week' : 'employee-day'}>{days.map(key => {
      const visibleRange = salonDayRange(key);
      const dayAppointments = appointments.filter(a => appointmentOverlapsRange(a, visibleRange)); const today = key === salonDateKey(now);
      return <section className={`employee-calendar-day ${today ? 'is-today' : ''}`} key={key} aria-label={dateFormat(`${key}T12:00:00Z`, { weekday: 'long', day: 'numeric', month: 'long' })}><h2><span>{dateFormat(`${key}T12:00:00Z`, { weekday: 'short' })}</span><strong>{dateFormat(`${key}T12:00:00Z`, { day: 'numeric', month: 'numeric' })}</strong></h2><div className="employee-appointment-list">{dayAppointments.map(a => <AppointmentButton key={a.id} appointment={a} onSelect={setSelected} />)}{desktop && dayAppointments.length === 0 && <p className="employee-day-empty">—<span className="sr-only">{t('Žiadne rezervácie v tomto období.')}</span></p>}</div></section>;
    })}</div>}
    <AppointmentDetail appointment={online ? selected : null} onClose={() => setSelected(null)} returnFocus={returnFocus} /></>;
}

function AppointmentsContent() {
  const { t } = useEmployeeText(); const [period, setPeriod] = useState<'upcoming' | 'history'>('upcoming'); const [status, setStatus] = useState('all'); const [search, setSearch] = useState(''); const [page, setPage] = useState(0); const { selected, setSelected, returnFocus } = useAppointmentSelection(); const online = useOnline();
  const query = useEmployeeAppointments({ period, status, search, page }); const appointments = query.data?.appointments ?? []; const pageCount = Math.max(1, Math.ceil((query.data?.total ?? 0) / EMPLOYEE_PAGE_SIZE)); const canShow = online && !query.isPending && !query.isError;
  return <><PageHeading title="Rezervácie" description={t('Prehľad vašich termínov a klientov.')} refresh={() => void query.refetch()} busy={query.isFetching} />
    <div className="employee-segment" role="group" aria-label={t('Rezervácie')}>{(['upcoming', 'history'] as const).map(value => <button type="button" key={value} aria-pressed={period === value} onClick={() => { setPeriod(value); setPage(0); }}>{t(value === 'upcoming' ? 'Nadchádzajúce' : 'História')}</button>)}</div>
    <div className="employee-filters"><label><span>{t('Hľadať rezerváciu')}</span><div className="employee-search"><Search size={18} aria-hidden="true" /><input type="search" value={search} placeholder={t('Meno klienta alebo služba')} onChange={event => { setSearch(event.target.value); setPage(0); }} /></div></label><label><span>{t('Stav rezervácie')}</span><select value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}><option value="all">{t('Všetky stavy')}</option>{Object.entries(statusText).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label></div>
    <QueryState pending={query.isPending} error={query.isError} empty={appointments.length === 0} retry={() => void query.refetch()} />
    {canShow && <><div className="employee-appointment-list">{appointments.map(a => <AppointmentButton key={a.id} appointment={a} onSelect={setSelected} showDate />)}</div><nav className="employee-pagination" aria-label={t('Rezervácie')}><button type="button" className="employee-icon-button" aria-label={t('Predchádzajúca strana')} disabled={page === 0} onClick={() => setPage(value => value - 1)}><ChevronLeft size={20} aria-hidden="true" /></button><span aria-live="polite">{t('Strana')} {page + 1} {t('z')} {pageCount}</span><button type="button" className="employee-icon-button" aria-label={t('Ďalšia strana')} disabled={page + 1 >= pageCount} onClick={() => setPage(value => value + 1)}><ChevronRight size={20} aria-hidden="true" /></button></nav></>}
    <AppointmentDetail appointment={online ? selected : null} onClose={() => setSelected(null)} returnFocus={returnFocus} /></>;
}

export function EmployeeDashboardPage() { return <ScopeBoundary><TodayContent /></ScopeBoundary>; }
export function EmployeeCalendarPage() { return <ScopeBoundary><CalendarContent /></ScopeBoundary>; }
export function EmployeeAppointmentsPage() { return <ScopeBoundary><AppointmentsContent /></ScopeBoundary>; }
