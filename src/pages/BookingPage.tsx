import BookingHeader from "@/components/BookingHeader";
import { useBookingLanguage } from "@/lib/booking-language";
import { revealBookingOffer as revealOffer } from "@/lib/reveal-booking-offer";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { createPublicBooking } from "@/lib/create-public-booking";
import { salonDayRange, salonTime } from "@/lib/employee-dashboard";
import { generateSlots, getEffectiveIntervals, type BusinessHours, type EmployeeSchedule, type ExistingAppointment, type BusinessHourEntry, type DateOverrideEntry } from "@/lib/availability";
import { toast } from "sonner";
import { format, addDays, startOfDay, isSameDay, isAfter, isBefore, getDaysInMonth, getDay, startOfMonth } from "date-fns";
import { sk, enGB } from "date-fns/locale";
import { z } from "zod";
import { User, Mail, Phone, PenLine, ChevronLeft, ChevronRight, Star, Check, Loader2 } from "lucide-react";
import miskaImg from "@/assets/employee-miska.jpeg";
import matoImg from "@/assets/employee-mato.jpg";

const DEMO_BUSINESS_ID = "a1b2c3d4-0000-0000-0000-000000000001";

// Map employee IDs to local photos
const EMPLOYEE_PHOTOS: Record<string, string> = {
  "c1000000-0000-0000-0000-000000000001": miskaImg,
  "c1000000-0000-0000-0000-000000000002": matoImg,
};

const contactSchema = z.object({
  meno: z.string().min(2, "Meno musí mať aspoň 2 znaky"),
  priezvisko: z.string().min(2, "Priezvisko musí mať aspoň 2 znaky"),
  email: z.string().email("Neplatný email"),
  phone: z.string().optional(),
});

interface ServiceRow {
  id: string;
  name_sk: string;
  description_sk: string | null;
  price: number | null;
  duration_minutes: number;
  buffer_minutes: number;
  is_active: boolean;
  business_id: string;
  category: string | null;
  subcategory: string | null;
}

interface EmployeeRow {
  id: string;
  display_name: string;
  photo_url: string | null;
}

type PublicBusiness = Pick<Tables<"businesses">, "id" | "opening_hours" | "lead_time_minutes" | "max_days_ahead">;

interface BookingResult {
  claim_token?: string;
  customer_email?: string;
  customer_name?: string;
}

export default function BookingPage() {
  const { language, setLanguage, t } = useBookingLanguage();
  const dateLocale = language === "en" ? enGB : sk;

  const servicesOffer = useRef<HTMLDivElement>(null);
  const workersOffer = useRef<HTMLDivElement>(null);

  // Data states
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [business, setBusiness] = useState<PublicBusiness | null>(null);
  const [businessHourEntries, setBusinessHourEntries] = useState<BusinessHourEntry[]>([]);
  const [dateOverrides, setDateOverrides] = useState<DateOverrideEntry[]>([]);
  const [schedules, setSchedules] = useState<Record<string, EmployeeSchedule[]>>({});
  const [initialLoading, setInitialLoading] = useState(true);

  // Booking states
  const [category, setCategory] = useState<"damske" | "panske">("damske");
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [serviceSelection, setServiceSelection] = useState<{ id: string | null; revision: number }>({ id: null, revision: 0 });
  const [loadedEmployeesScope, setLoadedEmployeesScope] = useState<{ serviceId: string; revision: number } | null>(null);
  const selectedServiceId = serviceSelection.id;
  const setSelectedServiceId = useCallback((id: string | null) => {
    // Invalidate during the event/render transition, not in a later passive effect.
    // Revision also prevents a cleared and reselected identical service using old rows.
    setLoadedEmployeesScope(null);
    setServiceSelection(previous => ({ id, revision: previous.revision + 1 }));
  }, []);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  useEffect(() => {
    if (subcategory && !selectedServiceId) revealOffer(servicesOffer.current);
  }, [subcategory, selectedServiceId]);
  useEffect(() => {
    if (selectedServiceId) revealOffer(workersOffer.current);
  }, [selectedServiceId]);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [formData, setFormData] = useState({
    meno: "", priezvisko: "", email: "", phone: "", note: "",
    marketing: false, terms: false, all: false,
  });
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [bookingDone, setBookingDone] = useState(false);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);

  // Availability
  const [availableSlots, setAvailableSlots] = useState<Date[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [availabilityError, setAvailabilityError] = useState(false);
  const [slotRefresh, setSlotRefresh] = useState(0);

  // Match the deployed public catalogue contract; never fetch private employee
  // fields, memberships, or the business SMTP/configuration columns here.
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const [bizRes, svcRes, empRes, bhRes, bdoRes] = await Promise.all([
        supabase.from("businesses").select("opening_hours, lead_time_minutes, max_days_ahead").eq("id", DEMO_BUSINESS_ID).abortSignal(controller.signal).maybeSingle(),
        supabase.from("services").select("*").eq("business_id", DEMO_BUSINESS_ID).eq("is_active", true).order("name_sk").abortSignal(controller.signal),
        supabase.rpc("get_public_bookable_employees", { _business_id: DEMO_BUSINESS_ID, _service_id: null }).abortSignal(controller.signal),
        supabase.from("business_hours").select("*").eq("business_id", DEMO_BUSINESS_ID).order("sort_order").abortSignal(controller.signal),
        supabase.from("business_date_overrides").select("*").eq("business_id", DEMO_BUSINESS_ID).gte("override_date", new Date().toISOString().slice(0, 10)).abortSignal(controller.signal),
      ]);
      if (controller.signal.aborted) return;
      // The ID is the already-known query scope, not an additional public column.
      setBusiness(bizRes.data ? { ...bizRes.data, id: DEMO_BUSINESS_ID } : null);
      setServices((svcRes.data ?? []) as unknown as ServiceRow[]);
      setEmployees(empRes.data ?? []);
      if (bizRes.error || svcRes.error || empRes.error || bhRes.error || bdoRes.error) toast.error(t("Chyba pri komunikácii so serverom"));
      setBusinessHourEntries((bhRes.data ?? []).map((h: Tables<"business_hours">) => ({
        day_of_week: h.day_of_week, mode: h.mode, start_time: h.start_time, end_time: h.end_time,
      })));
      setDateOverrides((bdoRes.data ?? []).map((o: Tables<"business_date_overrides">) => ({
        override_date: o.override_date, mode: o.mode, start_time: o.start_time, end_time: o.end_time,
      })));
      const employeeIds = (empRes.data ?? []).map(employee => employee.id);
      if (employeeIds.length) {
        const { data, error } = await supabase.from("schedules").select("*").in("employee_id", employeeIds).abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        const map: Record<string, EmployeeSchedule[]> = {};
        (data ?? []).forEach(schedule => { (map[schedule.employee_id] ??= []).push(schedule); });
        setSchedules(map);
        if (error) toast.error(t("Chyba pri komunikácii so serverom"));
      }
      setInitialLoading(false);
    };
    void load();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedServiceId) return;
    const controller = new AbortController();
    const loadServiceEmployees = async () => {
      setEmployees([]); setSchedules({});
      setSelectedWorkerId(null); setSelectedDate(null); setSelectedTime(null);
      const { data, error } = await supabase.rpc("get_public_bookable_employees", {
        _business_id: DEMO_BUSINESS_ID, _service_id: selectedServiceId,
      }).abortSignal(controller.signal);
      if (controller.signal.aborted) return;
      if (error) {
        setLoadedEmployeesScope({ serviceId: selectedServiceId, revision: serviceSelection.revision });
        toast.error(t("Chyba pri komunikácii so serverom")); return;
      }
      const rows = data ?? [];
      setEmployees(rows);
      if (!rows.length) {
        setLoadedEmployeesScope({ serviceId: selectedServiceId, revision: serviceSelection.revision });
        return;
      }
      const { data: scheduleRows, error: scheduleError } = await supabase.from("schedules").select("*").in("employee_id", rows.map(employee => employee.id)).abortSignal(controller.signal);
      if (controller.signal.aborted) return;
      if (scheduleError) {
        setLoadedEmployeesScope({ serviceId: selectedServiceId, revision: serviceSelection.revision });
        toast.error(t("Chyba pri komunikácii so serverom")); return;
      }
      const map: Record<string, EmployeeSchedule[]> = {};
      (scheduleRows ?? []).forEach(schedule => { (map[schedule.employee_id] ??= []).push(schedule); });
      setSchedules(map);
      setLoadedEmployeesScope({ serviceId: selectedServiceId, revision: serviceSelection.revision });
    };
    void loadServiceEmployees();
    return () => controller.abort();
  }, [selectedServiceId, serviceSelection.revision]);

  // Derived: grouped subcategories
  const subcategories = useMemo(() => {
    const cats = services
      .filter((s) => s.category === category && s.subcategory)
      .map((s) => s.subcategory!);
    return [...new Set(cats)].sort();
  }, [services, category]);

  // Derived: filtered services for selected subcategory
  const filteredServices = useMemo(() => {
    if (!subcategory) return [];
    return services.filter((s) => s.category === category && s.subcategory === subcategory);
  }, [services, category, subcategory]);

  const selectedService = services.find((s) => s.id === selectedServiceId) ?? null;

  // The public RPC owns service assignment and provider eligibility rules.
  const workersReady = loadedEmployeesScope?.serviceId === selectedServiceId && loadedEmployeesScope?.revision === serviceSelection.revision;
  const filteredEmployees = workersReady ? employees : [];

  const selectedEmployee = filteredEmployees.find((e) => e.id === selectedWorkerId) ?? null;

  // Calendar helpers
  const today = startOfDay(new Date());
  const maxDays = business?.max_days_ahead ?? 60;
  const monthStart = startOfMonth(calendarMonth);
  const daysInMonth = getDaysInMonth(calendarMonth);
  const firstDayOffset = (getDay(monthStart) + 6) % 7; // Monday-first

  // Build actual Date for selected calendar day
  const selectedFullDate = useMemo(() => {
    if (!selectedDate) return null;
    return new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), selectedDate);
  }, [selectedDate, calendarMonth]);

  // Check if employee available on a day
  const isEmployeeAvailableOnDay = useCallback((empId: string, date: Date) => {
    const dayName = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][date.getDay()];
    return (schedules[empId] ?? []).some((s) => s.day_of_week === dayName);
  }, [schedules]);

  // Check if business is open on a day
  const isBusinessOpenOnDay = useCallback((date: Date) => {
    const intervals = getEffectiveIntervals(
      date,
      businessHourEntries,
      dateOverrides,
      business?.opening_hours as BusinessHours | undefined
    );
    return !!(intervals && intervals.length > 0);
  }, [businessHourEntries, dateOverrides, business]);

  // Load slots when date selected
  useEffect(() => {
    if (!selectedFullDate || !selectedEmployee || !selectedService || !business) {
      setAvailableSlots([]);
      return;
    }
    const controller = new AbortController();
    const loadSlots = async () => {
      setLoadingSlots(true);
      setAvailabilityError(false);
      setAvailableSlots([]);
      setSelectedTime(null);
      const dayRange = salonDayRange(format(selectedFullDate, "yyyy-MM-dd"));

      const { data: existing, error } = await supabase.rpc("get_public_busy_intervals", {
        _business_id: business.id,
        _employee_id: selectedEmployee.id,
        _start: dayRange.start,
        _end: dayRange.end,
      }).abortSignal(controller.signal);
      if (controller.signal.aborted) return;
      if (error) {
        // Fail closed: a missing/failed availability endpoint is not an empty day.
        setAvailableSlots([]);
        setAvailabilityError(true);
        setLoadingSlots(false);
        toast.error(t("Chyba pri komunikácii so serverom"));
        return;
      }

      const slots = generateSlots({
        date: selectedFullDate,
        timeZone: "Europe/Bratislava",
        serviceDuration: selectedService.duration_minutes,
        serviceBuffer: selectedService.buffer_minutes ?? 0,
        openingHours: (business.opening_hours ?? {}) as BusinessHours,
        businessHourEntries: businessHourEntries.length ? businessHourEntries : undefined,
        dateOverrides: dateOverrides.length ? dateOverrides : undefined,
        employeeSchedules: schedules[selectedEmployee.id] ?? [],
        existingAppointments: (existing ?? []) as ExistingAppointment[],
        leadTimeMinutes: business.lead_time_minutes ?? 60,
      });

      setAvailableSlots(slots);
      setLoadingSlots(false);
    };
    void loadSlots();
    return () => controller.abort();
  }, [selectedFullDate, selectedEmployee, selectedService, business, schedules, businessHourEntries, dateOverrides, slotRefresh]);

  // Group available slots
  const timeGroups = useMemo(() => {
    const dopoludnia: string[] = [];
    const popoludni: string[] = [];
    availableSlots.forEach((slot) => {
      const t = salonTime(slot);
      if (Number(t.slice(0, 2)) < 12) dopoludnia.push(t);
      else popoludni.push(t);
    });
    return { dopoludnia, popoludni };
  }, [availableSlots]);

  // Consent handlers
  const handleCheckAll = () => {
    const newValue = !formData.all;
    setFormData({ ...formData, all: newValue, marketing: newValue, terms: newValue });
  };
  const handleConsentChange = (field: "marketing" | "terms") => {
    const newData = { ...formData, [field]: !formData[field] };
    newData.all = newData.marketing && newData.terms;
    setFormData(newData);
  };

  // Submit booking
  const handleSubmit = async () => {
    const result = contactSchema.safeParse(formData);
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.issues.forEach((e) => { if (e.path[0]) errs[e.path[0] as string] = e.message; });
      setContactErrors(errs);
      return;
    }
    if (!formData.terms) {
      toast.error(t("Musíte súhlasiť s obchodnými podmienkami"));
      return;
    }
    setContactErrors({});
    setSubmitting(true);

    // Find the actual slot Date
    const slotDate = availableSlots.find((s) => salonTime(s) === selectedTime);
    if (!slotDate) {
      toast.error(t("Vybraný čas už nie je dostupný"));
      setSubmitting(false);
      return;
    }

    try {
      const { data, error } = await createPublicBooking(supabase, {
        business_id: DEMO_BUSINESS_ID,
        service_id: selectedServiceId,
        employee_id: selectedWorkerId,
        start_at: slotDate.toISOString(),
        customer_name: `${formData.meno} ${formData.priezvisko}`.trim(),
        customer_email: formData.email,
        customer_phone: formData.phone || undefined,
      });

      if (error || data?.error) {
        toast.error(t(data?.error ?? "Chyba pri vytváraní rezervácie"));
        setSubmitting(false);
        return;
      }

      setBookingResult(data);
      setBookingDone(true);
      toast.success(t("Rezervácia úspešne vytvorená!"));
    } catch {
      toast.error(t("Chyba pri komunikácii so serverom"));
    }
    setSubmitting(false);
  };

  // UI helpers
  const GoldText = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
    <span className={`text-primary ${className}`}>{children}</span>
  );

  const StepHeader = ({ num, title, extra, onReveal }: { num: string; title: string; extra?: React.ReactNode; onReveal?: () => void }) => (
    <div className="flex items-center justify-between mt-8 mb-4">
      <div className="flex items-center gap-4">
        <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm bg-primary text-primary-foreground dark:text-background">
          {num}
        </div>
        <h2 className="text-xl font-medium tracking-wide text-foreground">{onReveal ? <button type="button" onClick={onReveal} className="text-left rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{t(title)}</button> : t(title)}</h2>
      </div>
      {extra && <div>{extra}</div>}
    </div>
  );

  const RadioIcon = ({ selected }: { selected: boolean }) => (
    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${selected ? "border-primary" : "border-muted-foreground/40"
      }`}>
      {selected && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
    </div>
  );

  if (initialLoading) {
    return (
      <div className="booking-shell bg-background">
        <BookingHeader language={language} onLanguageChange={setLanguage} />
        <div className="min-h-[50vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      </div>
    );
  }

  if (bookingDone && bookingResult) {
    return (
      <div className="min-h-screen bg-background">
        <BookingHeader language={language} onLanguageChange={setLanguage} />
        <div className="max-w-md mx-auto px-4 py-12 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
            <Check className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground">{t("Rezervácia potvrdená!")}</h2>
          <p className="text-muted-foreground text-sm">
            {t("Vaša rezervácia bola úspešne vytvorená. Potvrdenie vám príde na email.")}
          </p>
          <div className="rounded-2xl border border-border bg-card p-4 text-left space-y-2 text-sm">
            <p><strong className="text-foreground">{t("Služba:")}</strong> <span className="text-muted-foreground">{selectedService ? t(selectedService.name_sk) : ""}</span></p>
            <p><strong className="text-foreground">{t("Zamestnanec:")}</strong> <span className="text-muted-foreground">{selectedEmployee?.display_name}</span></p>
            <p><strong className="text-foreground">{t("Dátum:")}</strong> <span className="text-muted-foreground">{selectedFullDate && format(selectedFullDate, "d. MMMM yyyy", { locale: dateLocale })}</span></p>
            <p><strong className="text-foreground">{t("Čas:")}</strong> <span className="text-muted-foreground">{selectedTime}</span></p>
          </div>
          <button
            onClick={() => {
              sessionStorage.setItem("claim_token", bookingResult.claim_token);
              window.location.href = `/auth?mode=register&email=${encodeURIComponent(bookingResult.customer_email)}&name=${encodeURIComponent(bookingResult.customer_name)}`;
            }}
            className="papi-control w-full font-bold py-4 rounded-full text-lg bg-primary text-primary-foreground dark:text-background hover:bg-primary/90 transition-colors"
          >
            {t("Dokonči registráciu")}
          </button>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-primary hover:underline"
          >
            {t("Nová rezervácia")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="booking-shell font-sans pb-24 w-full relative overflow-x-hidden transition-colors duration-300 bg-background text-foreground">
      {/* Header */}
      <BookingHeader language={language} onLanguageChange={setLanguage} />

      <div className="px-4 max-w-md mx-auto">
        {/* Step 1: Kategória */}
        <StepHeader num="1" title={t("Vyberte kategóriu")} extra={
          <div className="flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium border border-primary text-primary">
            4.9 <Star size={14} className="fill-primary" />
          </div>
        } />

        <div className="flex flex-col gap-3">
          {(["damske", "panske"] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => { setCategory(cat); setSubcategory(null); setSelectedServiceId(null); setSelectedWorkerId(null); setSelectedDate(null); setSelectedTime(null); }}
              aria-pressed={category === cat}
              className={`papi-control w-full py-3.5 rounded-full font-medium text-lg transition-colors ${category === cat
                ? "bg-primary text-primary-foreground dark:text-background shadow-lg shadow-primary/20"
                : "bg-card text-muted-foreground border border-border"
                }`}
            >
              {cat === "damske" ? t("Dámske Služby") : t("Pánske Služby")}
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-3">
          {subcategories.map((sub) => (
            <button
              key={t(sub)}
              onClick={() => { setSubcategory(sub); setSelectedServiceId(null); setSelectedWorkerId(null); setSelectedDate(null); setSelectedTime(null); }}
              aria-pressed={subcategory === sub}
              className={`papi-control w-full py-3.5 rounded-full border transition-colors duration-200 text-sm font-medium uppercase tracking-wider ${subcategory === sub
                ? "border-primary bg-card text-primary"
                : "border-border text-muted-foreground bg-card hover:border-muted-foreground/50"
                }`}
            >
              {t(sub)}
            </button>
          ))}
        </div>

        {/* Step 2: Služba */}
        {subcategory && filteredServices.length > 0 && (
          <div key={subcategory} ref={servicesOffer} className="booking-offer" aria-label="Ponuka služieb">
            <StepHeader num="2" title={t("Vyberte službu")} onReveal={() => revealOffer(servicesOffer.current)} />
            <div className="flex flex-col gap-3">
              {filteredServices.map((srv) => (
                <label
                  key={srv.id}
                  className={`booking-choice border rounded-[2rem] p-4 flex items-center gap-4 cursor-pointer transition-colors duration-200 ${selectedServiceId === srv.id
                    ? "border-primary bg-card"
                    : "border-border bg-card"
                    }`}
                >
                  <input type="radio" name="booking-service" value={srv.id} checked={selectedServiceId === srv.id}
                    aria-label={t(srv.name_sk)} aria-describedby={`service-details-${srv.id}`} className="sr-only"
                    onChange={() => { setSelectedServiceId(srv.id); setSelectedWorkerId(null); setSelectedDate(null); setSelectedTime(null); }} />
                  <span aria-hidden="true"><RadioIcon selected={selectedServiceId === srv.id} /></span>
                  <div className="flex flex-col flex-1">
                    <span className="font-bold text-sm text-foreground">{t(srv.name_sk)}</span>
                    <span id={`service-details-${srv.id}`} className="text-sm text-muted-foreground">
                      {srv.duration_minutes} min
                      {srv.price != null && (
                        <> – <GoldText className="font-medium">{srv.price} €</GoldText></>
                      )}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Pracovník */}
        {selectedServiceId && (
          <div key={selectedServiceId} ref={workersOffer} className="booking-offer" aria-label="Ponuka pracovníkov">
            <StepHeader num="3" title={t("Vyberte pracovníka")} onReveal={() => revealOffer(workersOffer.current)} />
            {!workersReady && <p role="status" className="text-center text-muted-foreground py-4">{t("Načítavam...")}</p>}
            <div className="flex flex-col gap-4" aria-busy={!workersReady}>
              {filteredEmployees.map((w) => (
                <label
                  key={w.id}
                  className={`booking-choice border rounded-[2rem] p-2 flex items-center gap-4 cursor-pointer transition-colors duration-200 ${selectedWorkerId === w.id
                    ? "border-primary bg-card"
                    : "border-border bg-card"
                    }`}
                >
                  <input type="radio" name="booking-worker" value={w.id} checked={selectedWorkerId === w.id}
                    aria-label={w.display_name} className="sr-only"
                    onChange={() => { setSelectedWorkerId(w.id); setSelectedDate(null); setSelectedTime(null); }} />
                  <div className="pl-2" aria-hidden="true"><RadioIcon selected={selectedWorkerId === w.id} /></div>
                  <div className="flex w-full h-24 rounded-2xl overflow-hidden border border-primary/30">
                    <div className="w-1/3 h-full relative">
                      <img
                        src={EMPLOYEE_PHOTOS[w.id] || w.photo_url || ""}
                        alt={w.display_name}
                        className="object-cover w-full h-full"
                      />
                    </div>
                    <div className="w-2/3 flex items-center justify-center bg-background dark:bg-card">
                      <span className="font-bold text-lg tracking-wide text-primary">{w.display_name}</span>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Dátum */}
        {selectedWorkerId && (
          <div className="animate-fade-in">
            <StepHeader num="4" title={t("Vyberte dátum")} />
            <div className="booking-calendar rounded-xl p-4 border border-border bg-card">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-lg ml-2 text-foreground">
                  {format(calendarMonth, "LLLL yyyy", { locale: dateLocale })}
                </h3>
                <div className="flex rounded-full overflow-hidden border border-border">
                  <button
                    aria-label={language === "sk" ? "Predchádzajúci mesiac" : "Previous month"}
                    onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                    className="p-2 px-4 bg-card text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    aria-label={language === "sk" ? "Nasledujúci mesiac" : "Next month"}
                    onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                    className="p-2 px-4 bg-primary text-primary-foreground dark:text-background hover:bg-primary/80 transition-colors"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>

              <div className="booking-calendar-scroll" role="region" tabIndex={0} aria-label={language === "sk" ? "Kalendár termínov" : "Appointment calendar"}>
              <div className="booking-calendar-grid grid grid-cols-7 gap-y-4 text-center mb-2">
                {["Po", "Ut", "St", "Št", "Pi", "So", "Ne"].map((d) => (
                  <div key={d} className="font-medium text-sm text-muted-foreground">{t(d)}</div>
                ))}

                {[...Array(firstDayOffset)].map((_, i) => <div key={`empty-${i}`} className="py-1" />)}
                {[...Array(daysInMonth)].map((_, i) => {
                  const day = i + 1;
                  const dayDate = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
                  const isPast = isBefore(dayDate, today);
                  const isTooFar = isAfter(dayDate, addDays(today, maxDays));
                  const isClosed = !isBusinessOpenOnDay(dayDate);
                  const empAvailable = selectedWorkerId ? isEmployeeAvailableOnDay(selectedWorkerId, dayDate) : false;
                  const disabled = isPast || isTooFar || isClosed || !empAvailable;
                  const isSelected = selectedDate === day && isSameDay(dayDate, selectedFullDate ?? new Date(0));
                  const isToday = isSameDay(dayDate, today);

                  return (
                    <div key={day} className="flex justify-center">
                      <button
                        onClick={() => { if (!disabled) { setSelectedDate(day); setSelectedTime(null); } }}
                        disabled={disabled}
                        aria-pressed={isSelected}
                        className={`booking-day w-11 h-11 rounded-full flex items-center justify-center text-sm transition-colors ${isSelected
                          ? "bg-primary text-primary-foreground dark:text-background font-bold shadow-md"
                          : isToday
                            ? "border border-muted-foreground/40 text-foreground"
                            : isPast || isTooFar
                              ? "text-muted-foreground/20 cursor-not-allowed"
                              : isClosed
                                ? "bg-muted/40 text-muted-foreground/30 cursor-not-allowed" // Zatmavime zatvorene dni
                                : !empAvailable
                                  ? "text-muted-foreground/20 cursor-not-allowed"
                                  : "text-foreground hover:bg-accent"
                          }`}
                      >
                        {day}
                      </button>
                    </div>
                  );
                })}
              </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Čas */}
        {selectedDate && (
          <div className="animate-fade-in">
            <StepHeader num="5" title={t("Vyberte čas")} />
            {loadingSlots ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : availabilityError ? (
              <div role="alert" className="text-center py-4 space-y-3">
                <p>{t("Chyba pri komunikácii so serverom")}</p>
                <button type="button" className="min-h-[44px] rounded-full border border-border px-4" onClick={() => setSlotRefresh(value => value + 1)}>{language === "en" ? "Try again" : "Skúsiť znova"}</button>
              </div>
            ) : availableSlots.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">{t("Žiadne dostupné termíny v tento deň")}</p>
            ) : (
              <>
                {timeGroups.dopoludnia.length > 0 && (
                  <div className="mb-8">
                    <h4 className="text-sm font-bold uppercase tracking-wider mb-4 text-muted-foreground">{t("Dopoludnia")}</h4>
                    <div className="flex flex-wrap gap-x-4 gap-y-3">
                      {timeGroups.dopoludnia.map((t) => (
                        <button
                          key={t}
                          onClick={() => setSelectedTime(t)}
                          className={`text-base px-4 py-2 rounded-full transition-colors font-medium border ${selectedTime === t
                            ? "bg-primary text-primary-foreground dark:text-background border-primary"
                            : "bg-card text-foreground border-border hover:border-primary/50"
                            }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {timeGroups.popoludni.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-wider mb-4 text-muted-foreground">{t("Popoludní")}</h4>
                    <div className="flex flex-wrap gap-x-4 gap-y-3">
                      {timeGroups.popoludni.map((t) => (
                        <button
                          key={t}
                          onClick={() => setSelectedTime(t)}
                          className={`text-base px-4 py-2 rounded-full transition-colors font-medium border ${selectedTime === t
                            ? "bg-primary text-primary-foreground dark:text-background border-primary"
                            : "bg-card text-foreground border-border hover:border-primary/50"
                            }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 6: Údaje */}
        {selectedTime && (
          <div className="animate-fade-in pb-10">
            <StepHeader num="6" title="Vyplňte Vaše údaje" />

            <div className="flex flex-col gap-4 mb-6">
              {[
                { icon: User, placeholder: "Meno", field: "meno" as const, type: "text" },
                { icon: User, placeholder: "Priezvisko", field: "priezvisko" as const, type: "text" },
                { icon: Mail, placeholder: "Email", field: "email" as const, type: "email" },
              ].map((input, idx) => (
                <div key={idx}>
                  <div className={`flex border rounded-full overflow-hidden transition-colors border-border focus-within:border-primary`}>
                    <div className="w-12 flex items-center justify-center bg-muted text-primary">
                      <input.icon size={18} />
                    </div>
                    <input
                      type={input.type}
                      placeholder={t(input.placeholder)}
                      className="flex-1 py-3 px-4 outline-none bg-card text-foreground placeholder:text-muted-foreground"
                      value={formData[input.field]}
                      onChange={(e) => setFormData({ ...formData, [input.field]: e.target.value })}
                    />
                  </div>
                  {contactErrors[input.field] && (
                    <p className="text-destructive text-xs mt-1 ml-4">{t(contactErrors[input.field])}</p>
                  )}
                </div>
              ))}

              {/* Telefón */}
              <div className="flex border rounded-full overflow-hidden transition-colors border-border focus-within:border-primary">
                <div className="w-12 flex items-center justify-center bg-muted text-primary">
                  <Phone size={18} />
                </div>
                <div className="flex items-center px-3 border-r border-border bg-card">
                  <div className="w-4 h-3 rounded-sm overflow-hidden flex flex-col border border-muted-foreground/30">
                    <div className="h-1/3 bg-white w-full" />
                    <div className="h-1/3 bg-blue-600 w-full" />
                    <div className="h-1/3 bg-red-600 w-full" />
                  </div>
                  <span className="ml-2 text-sm text-muted-foreground">+421</span>
                </div>
                <input
                  type="tel"
                  className="flex-1 py-3 px-4 outline-none bg-card text-foreground"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>

              {/* Poznámka */}
              <div className="flex border rounded-3xl overflow-hidden transition-colors min-h-[100px] border-border focus-within:border-primary">
                <div className="w-12 flex items-start justify-center pt-4 bg-muted text-primary">
                  <PenLine size={18} />
                </div>
                <textarea
                  placeholder={t("Poznámka")}
                  className="flex-1 py-3 px-4 outline-none resize-none bg-card text-foreground placeholder:text-muted-foreground"
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                />
              </div>
            </div>

            {/* Consents */}
            <div className="flex flex-col gap-4 text-sm mb-8 text-muted-foreground">
              <label className="flex items-start gap-3 cursor-pointer group" onClick={handleCheckAll}>
                <div className={`w-5 h-5 mt-0.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${formData.all
                  ? "border-primary bg-primary"
                  : "border-muted-foreground/40 bg-transparent group-hover:border-primary"
                  }`}>
                  {formData.all && <Check size={14} className="text-primary-foreground dark:text-background" />}
                </div>
                <span className="font-medium text-foreground">{t("Označiť všetky možnosti")}</span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer group" onClick={() => handleConsentChange("marketing")}>
                <div className={`w-5 h-5 mt-0.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${formData.marketing
                  ? "border-primary bg-primary"
                  : "border-muted-foreground/40 bg-transparent group-hover:border-primary"
                  }`}>
                  {formData.marketing && <Check size={14} className="text-primary-foreground dark:text-background" />}
                </div>
                <div className="leading-snug">
                  {t("Súhlasím so spracovaním osobných údajov pre")} <strong className="text-foreground">Papi Hair Design</strong> {t("na marketingové účely")}{" "}
                  <span className="text-primary cursor-pointer hover:underline">{t("Podrobnosti tu")}</span>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer group" onClick={() => handleConsentChange("terms")}>
                <div className={`w-5 h-5 mt-0.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${formData.terms
                  ? "border-primary bg-primary"
                  : "border-muted-foreground/40 bg-transparent group-hover:border-primary"
                  }`}>
                  {formData.terms && <Check size={14} className="text-primary-foreground dark:text-background" />}
                </div>
                <div>
                  {t("Súhlasím so")} <span className="text-primary cursor-pointer hover:underline">{t("všeobecnými obchodnými podmienkami")}</span>
                </div>
              </label>

              <div className="text-right text-primary text-sm mt-2 cursor-pointer hover:underline">
                {t("Zásady ochrany osobných údajov")}
              </div>
            </div>

            {/* Summary */}
            {selectedService && selectedFullDate && (
              <div className="text-center text-sm font-medium mb-6 text-foreground">
                {t("Váš termín:")} <strong className="text-primary">{t(selectedService.name_sk)}</strong> {t("u")} <strong className="text-primary">{selectedEmployee?.display_name}</strong>
                {" "}{t("dňa")} <strong className="text-primary">{format(selectedFullDate, "d. MMMM", { locale: dateLocale })}</strong> {t("o")} <strong className="text-primary">{selectedTime}</strong>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="papi-control w-full font-bold py-4 rounded-full text-lg transition-colors bg-primary text-primary-foreground dark:text-background hover:bg-primary/90 shadow-lg shadow-primary/30 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : t("REZERVOVAŤ ONLINE")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
