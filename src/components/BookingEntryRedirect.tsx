import { Navigate, useLocation } from "react-router-dom";

export default function BookingEntryRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: "/booking", search, hash }} replace />;
}
