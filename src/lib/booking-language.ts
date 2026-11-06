import { useEffect, useState } from 'react';
export type BookingLanguage = 'sk' | 'en';
export const bookingEnglish: Record<string, string> = {
  "Vyberte kategóriu": "Choose a category",
  "Vyberte službu": "Choose a service",
  "Vyberte pracovníka": "Choose a stylist",
  "Vyberte dátum": "Choose a date",
  "Vyberte čas": "Choose a time",
  "Kontaktné údaje": "Contact details",
  "Dámske Služby": "Women's services",
  "Pánske Služby": "Men's services",
  "BALAYAGE": "BALAYAGE",
  "FARBENIE": "COLOUR",
  "PREDLŽOVANIE": "EXTENSIONS",
  "REGENERÁCIA": "TREATMENTS",
  "STRIH": "HAIRCUT",
  "STYLING": "STYLING",
  "Meno": "First name",
  "Priezvisko": "Last name",
  "Email": "Email",
  "Telefón": "Phone",
  "Poznámka": "Note",
  "Označiť všetky možnosti": "Select all options",
  "Podrobnosti tu": "Details",
  "všeobecnými obchodnými podmienkami": "terms and conditions",
  "Zásady ochrany osobných údajov": "Privacy policy",
  "REZERVOVAŤ ONLINE": "BOOK ONLINE",
  "Rezervácia úspešne vytvorená!": "Your booking has been created!",
  "Meno musí mať aspoň 2 znaky": "First name must contain at least 2 characters",
  "Priezvisko musí mať aspoň 2 znaky": "Last name must contain at least 2 characters",
  "Neplatný email": "Invalid email",
  "Chyba pri komunikácii so serverom": "Could not communicate with the server",
  "Súhlasím so": "I agree to the",
  "Súhlasím so spracovaním osobných údajov pre": "I consent to the processing of personal data by",
  "na marketingové účely": "for marketing purposes",
  "Váš termín:": "Your appointment:",
  "dňa": "on",
  "o": "at",
  "u": "with",
  "Po": "Mon",
  "Ut": "Tue",
  "St": "Wed",
  "Št": "Thu",
  "Pi": "Fri",
  "So": "Sat",
  "Ne": "Sun",
  "Späť": "Back",
  "Späť na web": "Back to website",
  "Nová rezervácia": "New booking",
  "Rezervácia potvrdená": "Booking confirmed",
  "Žiadne voľné termíny": "No available times",
  "Vyberte najprv pracovníka": "Choose a stylist first",
  "Načítavam...": "Loading…",
  "Dámske strihy": "Women's haircuts",
  "Pánske strihy": "Men's haircuts",
  "Farbenie vlasov": "Hair colouring",
  "Musíte súhlasiť s obchodnými podmienkami": "You must agree to the terms and conditions",
  "Vybraný čas už nie je dostupný": "The selected time is no longer available",
  "Chyba pri vytváraní rezervácie": "Could not create your booking",
  "Rezervácia potvrdená!": "Booking confirmed!",
  "Vaša rezervácia bola úspešne vytvorená. Potvrdenie vám príde na email.": "Your booking was created successfully. A confirmation will be sent to your email.",
  "Služba:": "Service:",
  "Zamestnanec:": "Stylist:",
  "Dátum:": "Date:",
  "Čas:": "Time:",
  "Dokonči registráciu": "Complete registration",
  "Žiadne dostupné termíny v tento deň": "No appointments available on this day",
  "Dopoludnia": "Morning",
  "Popoludní": "Afternoon",
  "Vyplňte Vaše údaje": "Enter your details",
  "Vážime si vaše súkromie": "We value your privacy",
  "Prijať všetko": "Accept all",
  "Prispôsobiť": "Customize",
  "Odmietnuť": "Reject",
  "zásadách ochrany osobných údajov": "privacy policy",
  "Nastavenia súborov cookie": "Cookie settings",
  "Nevyhnutné": "Necessary",
  "Vždy aktívne": "Always active",
  "Analytické": "Analytics",
  "Pomáhajú zlepšiť výkon a používanie": "Help improve performance and usability",
  "Marketingové": "Marketing",
  "Personalizované reklamy a obsah": "Personalized advertising and content",
  "Uložiť nastavenia": "Save preferences",
  "Zavrieť": "Close",
  "cookieDescription": "We use cookies to improve your browsing experience, provide personalized ads or content, and analyse our traffic. Read our",
  "cookieAcceptExplanation": "By clicking “Accept all”, you consent to our use of cookies."
};
export function translateBooking(text: string, language: BookingLanguage): string {
  return language === 'en' ? (bookingEnglish[text] ?? text) : text;
}
let sharedLanguage: BookingLanguage | undefined;
export function useBookingLanguage() {
  const [language, updateLanguage] = useState<BookingLanguage>(() => {
    if (sharedLanguage) return sharedLanguage;
    const query = new URLSearchParams(window.location.search).get('lang');
    if (query === 'sk' || query === 'en') return sharedLanguage = query;
    try { const saved = localStorage.getItem('papi_lang'); if (saved === 'sk' || saved === 'en') return sharedLanguage = saved; } catch { /* Storage is optional. */ }
    return sharedLanguage = 'sk';
  });
  const setLanguage = (next: BookingLanguage) => {
    sharedLanguage = next;
    updateLanguage(next);
    window.dispatchEvent(new CustomEvent('papi:language-change', { detail: next }));
  };
  useEffect(() => {
    const sync = (event: Event) => {
      const next = (event as CustomEvent).detail;
      if (next === 'sk' || next === 'en') updateLanguage(next);
    };
    window.addEventListener('papi:language-change', sync);
    return () => window.removeEventListener('papi:language-change', sync);
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    try { localStorage.setItem('papi_lang', language); } catch { /* Storage is optional. */ }
    if (window.parent !== window && document.referrer) {
      const origin = new URL(document.referrer).origin;
      if (['https://papihairdesign.sk', 'https://www.papihairdesign.sk', 'https://127.0.0.1:3002', 'https://localhost:3002'].includes(origin)) {
        window.parent.postMessage({ type: 'papi:language', language }, origin);
      }
    }
  }, [language]);
  return { language, setLanguage, t: (text: string) => translateBooking(text, language) };
}
