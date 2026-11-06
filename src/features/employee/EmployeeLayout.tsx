import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { CalendarDays, CalendarCheck2, LayoutDashboard, LogOut, UserRound, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { LogoIcon } from '@/components/LogoIcon';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useEmployeeText } from './text';
import './employee.css';

const navigation = [
  { to: '/admin', title: 'Dnes', Icon: LayoutDashboard },
  { to: '/admin/my', title: 'Kalendár', Icon: CalendarDays },
  { to: '/admin/appointments', title: 'Rezervácie', Icon: CalendarCheck2 },
];

function EmployeeNavigation({ className }: { className: string }) {
  const { t } = useEmployeeText();
  const navigationRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const navigation = navigationRef.current;
    if (!navigation || className !== 'employee-mobile-nav') return;
    const shell = navigation.closest<HTMLElement>('.employee-shell');
    const measure = () => shell?.style.setProperty('--employee-nav-height', `${navigation.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(navigation);
    return () => { observer.disconnect(); shell?.style.removeProperty('--employee-nav-height'); };
  }, [className]);
  return <nav ref={navigationRef} className={className} aria-label={t('Zamestnanecká navigácia')}>
    {navigation.map(({ to, title, Icon }) => <NavLink key={to} to={to} end={to === '/admin'} className={({ isActive }) => `employee-nav-link ${isActive ? 'is-active' : ''}`}>
      <Icon size={20} aria-hidden="true" /><span>{t(title)}</span>
    </NavLink>)}
  </nav>;
}

export function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const { t, language, setLanguage } = useEmployeeText();
  const navigate = useNavigate();
  const [error, setError] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const handleSignOut = async () => {
    setSigningOut(true); setError(false);
    try { await signOut(); navigate('/auth', { replace: true }); }
    catch { setError(true); }
    finally { setSigningOut(false); }
  };
  return <div className="employee-shell">
    <aside className="employee-sidebar">
      <LogoIcon size="md" />
      <p className="employee-eyebrow">PAPI · {t('Pracovný priestor')}</p>
      <EmployeeNavigation className="employee-desktop-nav" />
      <a className="employee-public-link" href="/booking"><ExternalLink size={17} aria-hidden="true" />{t('Otvoriť verejný booking')}</a>
    </aside>
    <div className="employee-workspace">
      <header className="employee-header">
        <div className="employee-header-brand"><LogoIcon size="md" /><span className="employee-eyebrow">{t('Pracovný priestor')}</span></div>
        <div className="employee-header-controls">
          <div className="language-control" role="group" aria-label="Výber jazyka / Language selection">
            {(['sk', 'en'] as const).map(code => <button key={code} type="button" lang={code} aria-label={code === 'sk' ? 'Prepnúť do slovenčiny' : 'Switch to English'} aria-pressed={language === code} onClick={() => setLanguage(code)}>{code.toUpperCase()}</button>)}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" className="employee-profile-button" aria-label={t('Môj profil')}><UserRound size={19} aria-hidden="true" /><span className="employee-profile-name">{profile?.full_name || t('Zamestnanec')}</span></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="employee-profile-menu">
              <DropdownMenuLabel>{profile?.full_name || t('Zamestnanec')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={signingOut} onSelect={() => void handleSignOut()}><LogOut size={17} aria-hidden="true" />{t('Odhlásiť sa')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {error && <p role="alert" className="employee-inline-error">{t('Odhlásenie sa nepodarilo. Skúste znova.')}</p>}
      <main id="employee-main" className="employee-main" tabIndex={-1}>{children}</main>
    </div>
    <EmployeeNavigation className="employee-mobile-nav" />
  </div>;
}
