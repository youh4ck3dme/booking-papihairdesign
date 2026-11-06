import { useBookingLanguage } from "@/lib/booking-language";
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import "@/styles/liquid-cookie.css";

interface CookiePrefs {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  timestamp: string;
}

const STORAGE_KEY = "cookie_prefs_v1";

function loadPrefs(): CookiePrefs | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p?.necessary !== true || typeof p.analytics !== "boolean" || typeof p.marketing !== "boolean") return null;
    return p as CookiePrefs;
  } catch {
    return null;
  }
}

function savePrefs(prefs: Omit<CookiePrefs, "timestamp">) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prefs, timestamp: new Date().toISOString() }));
}

export default function CookieConsent() {
  const { t } = useBookingLanguage();
  const [visible, setVisible] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    if (!loadPrefs()) setVisible(true);
  }, []);

  // ESC closes customize panel
  useEffect(() => {
    if (!customize) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCustomize(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [customize]);

  const acceptAll = useCallback(() => {
    savePrefs({ necessary: true, analytics: true, marketing: true });
    setVisible(false);
  }, []);

  const rejectAll = useCallback(() => {
    savePrefs({ necessary: true, analytics: false, marketing: false });
    setVisible(false);
  }, []);

  const openCustomize = useCallback(() => {
    const existing = loadPrefs();
    if (existing) { setAnalytics(existing.analytics); setMarketing(existing.marketing); }
    setCustomize(true);
  }, []);

  const saveCustom = useCallback(() => {
    savePrefs({ necessary: true, analytics, marketing });
    setVisible(false);
  }, [analytics, marketing]);

  if (!visible) return null;

  return (
    <div className="cookie-wrap" role="dialog" aria-label="Cookie consent" aria-describedby="cookie-desc">
      <div className="cookie-card">
        <div className="cookie-glow" />

        <div className="cookie-header">
          <div className="cookie-title">{t("Vážime si vaše súkromie")}</div>
        </div>

        <div className="cookie-body" id="cookie-desc">
          {t("cookieDescription")}{" "}
          <Link to="/privacy" className="text-primary underline hover:no-underline">{t("zásadách ochrany osobných údajov")}</Link>.
          {t("cookieAcceptExplanation")}
        </div>

        <div className="cookie-actions">
          <button className="cookie-btn cookie-btn--primary" onClick={acceptAll}>
            {t("Prijať všetko")}
          </button>
          <button className="cookie-btn cookie-btn--outline" onClick={openCustomize}>
            {t("Prispôsobiť")}
          </button>
          <button className="cookie-btn cookie-btn--ghost" onClick={rejectAll}>
            {t("Odmietnuť")}
          </button>
        </div>

        {customize && (
          <div className="cookie-panel" role="region" aria-label="Nastavenia cookies">
            <div className="cookie-panel-title">{t("Nastavenia súborov cookie")}</div>

            <label className="cookie-toggle">
              <input type="checkbox" checked disabled />
              <span className="cookie-toggle-ui" />
              <span className="cookie-toggle-text">
                <span>{t("Nevyhnutné")}</span>
                <span className="cookie-toggle-muted">{t("Vždy aktívne")}</span>
              </span>
            </label>

            <label className="cookie-toggle">
              <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
              <span className="cookie-toggle-ui" />
              <span className="cookie-toggle-text">
                <span>{t("Analytické")}</span>
                <span className="cookie-toggle-muted">{t("Pomáhajú zlepšiť výkon a používanie")}</span>
              </span>
            </label>

            <label className="cookie-toggle">
              <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
              <span className="cookie-toggle-ui" />
              <span className="cookie-toggle-text">
                <span>{t("Marketingové")}</span>
                <span className="cookie-toggle-muted">{t("Personalizované reklamy a obsah")}</span>
              </span>
            </label>

            <div className="cookie-panel-actions">
              <button className="cookie-btn cookie-btn--primary" onClick={saveCustom}>
                {t("Uložiť nastavenia")}
              </button>
              <button className="cookie-btn cookie-btn--ghost" onClick={() => setCustomize(false)}>
                {t("Zavrieť")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
