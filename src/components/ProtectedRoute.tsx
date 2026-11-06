import { Navigate } from "react-router-dom";
import { useAuth, type Membership } from "@/contexts/AuthContext";
import { useBusiness } from "@/hooks/useBusiness";
import { Loader2 } from "lucide-react";
import { useBookingLanguage } from "@/lib/booking-language";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  allowedRoles?: Membership['role'][];
}
export default function ProtectedRoute({ children, requireAdmin = false, allowedRoles = ['owner', 'admin', 'employee'] }: ProtectedRouteProps) {
  const { user, loading, authError, refreshProfile } = useAuth();
  const { role } = useBusiness();
  const { language } = useBookingLanguage();
  if (loading) return <div className="min-h-screen flex items-center justify-center" role="status" aria-label={language === 'en' ? 'Loading account' : 'Načítavam účet'}><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (authError) return <main className="max-w-md mx-auto p-6 space-y-4" role="alert"><p>{language === 'en' ? 'Could not verify your account. Connect to the internet, update the app and try again.' : authError}</p><button className="min-h-[44px] border rounded-xl px-4" onClick={() => void refreshProfile()}>{language === 'en' ? 'Try again' : 'Skúsiť znova'}</button></main>;
  if (!role || !allowedRoles.includes(role)) return <main className="max-w-md mx-auto p-6" role="alert">{language === 'en' ? 'This account has no employee access. Contact the salon administrator.' : 'Tento účet nemá zamestnanecký prístup. Kontaktujte správcu salónu.'}</main>;
  if (requireAdmin && role !== 'owner' && role !== 'admin') return <Navigate to="/admin" replace />;
  return <>{children}</>;
}
