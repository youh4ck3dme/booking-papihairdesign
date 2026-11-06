import { useBookingLanguage } from '@/lib/booking-language';

const english: Record<string, string> = {
  'Dnes': 'Today', 'Kalendár': 'Calendar', 'Môj kalendár': 'My calendar', 'Rezervácie': 'Appointments',
  'Zamestnanecká navigácia': 'Employee navigation', 'Pracovný priestor': 'Your workspace', 'Môj profil': 'My profile',
  'Odhlásiť sa': 'Sign out', 'Odhlásenie sa nepodarilo. Skúste znova.': 'Could not sign out. Please try again.',
  'Zamestnanec': 'Team member', 'Vitajte vo svojom pracovnom dni.': 'Your day, clearly organised.',
  'Obnoviť rezervácie': 'Refresh appointments', 'Aktívne termíny': 'Active appointments', 'Dokončené': 'Completed',
  'Najbližší termín': 'Next appointment', 'Žiadny ďalší termín': 'No more appointments', 'Dnešné rezervácie': 'Today’s appointments',
  'Žiadne rezervácie v tomto období.': 'No appointments in this period.', 'Načítavam rezervácie…': 'Loading appointments…',
  'Rezervácie sa nepodarilo načítať': 'Could not load appointments', 'Skúsiť znova': 'Try again',
  'Skontrolujte pripojenie a skúste to znova.': 'Check your connection and try again.',
  'Ste offline. Osobné rezervácie sa neukladajú do zariadenia.': 'You are offline. Personal appointments are not stored on this device.',
  'Váš účet nie je prepojený so zamestnancom.': 'Your account is not linked to a team member.',
  'Kontaktujte správcu salónu.': 'Please contact your salon administrator.', 'Do tejto časti nemáte prístup.': 'You do not have access to this area.',
  'Pripravujem bezpečné pripojenie…': 'Preparing a secure connection…',
  'Detail rezervácie': 'Appointment details', 'Neznámy klient': 'Unknown client', 'Bez názvu služby': 'Unnamed service',
  'Čaká na potvrdenie': 'Awaiting confirmation', 'Potvrdená': 'Confirmed', 'Zrušená': 'Cancelled', 'Dokončená': 'Completed',
  'Potvrdiť': 'Confirm', 'Dokončiť': 'Complete', 'Zrušiť rezerváciu': 'Cancel appointment',
  'Zrušiť túto rezerváciu?': 'Cancel this appointment?', 'Klientov termín bude označený ako zrušený. Tento krok nie je možné v tomto prehľade vrátiť.': 'The appointment will be marked as cancelled. This cannot be undone here.',
  'Ponechať rezerváciu': 'Keep appointment', 'Áno, zrušiť': 'Yes, cancel', 'Ukladám…': 'Saving…',
  'Zmenu sa nepodarilo uložiť. Skúste znova.': 'Could not save the change. Please try again.',
  'Rezervácia sa medzičasom zmenila. Obnovte prehľad.': 'This appointment has changed. Refresh the list.',
  'Tento termín už nie je možné meniť.': 'This appointment can no longer be changed.',
  'Vybrať dátum': 'Choose a date', 'Predchádzajúci deň': 'Previous day', 'Nasledujúci deň': 'Next day',
  'Predchádzajúci týždeň': 'Previous week', 'Nasledujúci týždeň': 'Next week', 'Týždeň': 'Week',
  'Všetky časy sú v časovom pásme salónu Europe/Bratislava.': 'All times use the salon’s Europe/Bratislava time zone.',
  'Nadchádzajúce': 'Upcoming', 'História': 'History', 'Hľadať rezerváciu': 'Search appointments',
  'Meno klienta alebo služba': 'Client name or service', 'Stav rezervácie': 'Appointment status', 'Všetky stavy': 'All statuses',
  'Predchádzajúca strana': 'Previous page', 'Ďalšia strana': 'Next page', 'Strana': 'Page', 'z': 'of',
  'Prehľad vašich termínov a klientov.': 'Your appointments and clients at a glance.',
  'Otvoriť verejný booking': 'Open public booking', 'Telefonovať klientovi': 'Call client', 'Napísať klientovi': 'Email client',
};

export function useEmployeeText() {
  const { language, setLanguage } = useBookingLanguage();
  return { language, setLanguage, t: (text: string) => language === 'en' ? (english[text] ?? text) : text };
}
