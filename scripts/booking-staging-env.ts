import { Buffer } from "node:buffer";

const PRODUCTION_SUPABASE_REF = "jxxzszwsxazcisgidziy";

type BuildEnvironment = Readonly<Record<string, string | undefined>>;

function isStagingPublicKey(key: string, ref: string): boolean {
  if (/^sb_publishable_[\w-]+$/.test(key)) return true;
  const parts = key.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[\w-]+$/.test(part))) return false;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return claims?.role === "anon" && claims.ref === ref;
  } catch {
    return false;
  }
}

export function verifyStagingSupabase(mode: string, env: BuildEnvironment): void {
  const target = env.VERCEL_TARGET_ENV || env.VERCEL_ENV;
  if ((mode === "vercel" || env.VERCEL === "1") && !target && mode !== "staging") {
    throw new Error("Booking build: Vercel target is missing. Enable System Environment Variables.");
  }

  const isStaging = mode === "staging" || env.VERCEL_ENV === "preview"
    || (target && target !== "production" && target !== "development");
  if (!isStaging) return;

  const ref = env.PAPI_BOOKING_STAGING_SUPABASE_REF?.trim();
  const projectId = env.VITE_SUPABASE_PROJECT_ID?.trim();
  const url = env.VITE_SUPABASE_URL?.trim();
  if (ref === PRODUCTION_SUPABASE_REF || projectId === PRODUCTION_SUPABASE_REF
    || url === `https://${PRODUCTION_SUPABASE_REF}.supabase.co`
    || url === `https://${PRODUCTION_SUPABASE_REF}.supabase.co/`) {
    throw new Error("Booking staging must never use the production Supabase project.");
  }
  if (!ref || !/^[a-z]{20}$/.test(ref)) {
    throw new Error("Booking staging requires an approved PAPI_BOOKING_STAGING_SUPABASE_REF.");
  }
  const expectedUrl = `https://${ref}.supabase.co`;
  if (projectId !== ref || (url !== expectedUrl && url !== `${expectedUrl}/`)) {
    throw new Error("Booking staging requires VITE_SUPABASE_PROJECT_ID and VITE_SUPABASE_URL for its approved project.");
  }
  if (!isStagingPublicKey(env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "", ref)) {
    throw new Error("Booking staging requires a publishable key or a legacy anon key for its approved project.");
  }
}
