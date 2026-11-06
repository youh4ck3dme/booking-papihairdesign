import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, LayoutDashboard } from "lucide-react";
import { LogoIcon } from "@/components/LogoIcon";
import { translateBooking, type BookingLanguage } from "@/lib/booking-language";
import "./booking-header.css";

interface BookingHeaderProps {
  language: BookingLanguage;
  onLanguageChange: (language: BookingLanguage) => void;
}

export default function BookingHeader({ language, onLanguageChange }: BookingHeaderProps) {
  const header = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = header.current;
    const shell = element?.parentElement;
    if (!element || !shell) return;
    const update = () => shell.style.setProperty("--booking-header-height", `${element.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => { observer.disconnect(); shell.style.removeProperty("--booking-header-height"); };
  }, []);

  return (
    <header ref={header} className="booking-header papi-surface">
      <div className="booking-header__inner">
        <div className="booking-header__brand">
          <LogoIcon size="md" className="booking-brand-logo" />
          <span>papihairdesign.sk</span>
        </div>
        <nav className="booking-header__nav" aria-label={language === "en" ? "Booking navigation" : "Navigácia rezervácie"}>
          <Link className="booking-header__link booking-header__link--dashboard" to="/admin">
            <LayoutDashboard aria-hidden="true" size={18} />
            <span>Dashboard</span>
          </Link>
          <a className="booking-header__link booking-header__link--website" href="https://papihairdesign.sk/">
            <ArrowUpRight aria-hidden="true" size={18} />
            <span>{translateBooking("Späť na web", language)}</span>
          </a>
        </nav>
        <div className="language-control" role="group" aria-label="Výber jazyka / Language selection">
          {(["sk", "en"] as const).map(code => (
            <button key={code} type="button" lang={code} aria-label={code === "sk" ? "Prepnúť do slovenčiny" : "Switch to English"} aria-pressed={language === code} onClick={() => onLanguageChange(code)}>{code.toUpperCase()}</button>
          ))}
        </div>
      </div>
    </header>
  );
}
