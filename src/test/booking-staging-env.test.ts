import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { verifyStagingSupabase } from "../../scripts/booking-staging-env";

const ref = "abcdefghijklmnopqrst";
const productionRef = "jxxzszwsxazcisgidziy";
const isolatedEnv = {
  PAPI_BOOKING_STAGING_SUPABASE_REF: ref,
  VITE_SUPABASE_PROJECT_ID: ref,
  VITE_SUPABASE_URL: `https://${ref}.supabase.co`,
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_build_fixture",
};
const legacyKey = (role: string, projectRef: string) => {
  const payload = Buffer.from(JSON.stringify({ role, ref: projectRef })).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture-signature`;
};

describe("Booking staging backend guard", () => {
  it("blocks automatic Preview and custom staging builds without an approved ref", () => {
    expect(() => verifyStagingSupabase("vercel", { VERCEL_ENV: "preview" })).toThrow(/approved/);
    expect(() => verifyStagingSupabase("vercel", { VERCEL_TARGET_ENV: "staging" })).toThrow(/approved/);
  });

  it("blocks hosted builds when the deployment target is absent", () => {
    expect(() => verifyStagingSupabase("vercel", isolatedEnv)).toThrow(/target is missing/);
  });

  it("rejects the production backend even when explicitly marked as approved", () => {
    expect(() => verifyStagingSupabase("staging", {
      PAPI_BOOKING_STAGING_SUPABASE_REF: productionRef,
      VITE_SUPABASE_PROJECT_ID: productionRef,
      VITE_SUPABASE_URL: `https://${productionRef}.supabase.co`,
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_production_fixture",
    })).toThrow(/production Supabase/);
  });

  it("requires both the URL and project ID to match the approved ref", () => {
    expect(() => verifyStagingSupabase("staging", {
      ...isolatedEnv, VITE_SUPABASE_URL: `https://${ref}.supabase.co/path`,
    })).toThrow(/URL/);
    expect(() => verifyStagingSupabase("staging", {
      ...isolatedEnv, VITE_SUPABASE_PROJECT_ID: undefined,
    })).toThrow(/PROJECT_ID/);
    expect(() => verifyStagingSupabase("staging", {
      ...isolatedEnv, VITE_SUPABASE_URL: `https://${productionRef}.supabase.co`,
    })).toThrow(/production Supabase/);
  });

  it.each([undefined, "sb_secret_fixture", legacyKey("service_role", ref), legacyKey("anon", productionRef)])(
    "rejects missing, privileged and foreign legacy keys",
    (key) => {
      expect(() => verifyStagingSupabase("staging", {
        ...isolatedEnv, VITE_SUPABASE_PUBLISHABLE_KEY: key,
      })).toThrow(/publishable key/);
    },
  );

  it("accepts an explicit staging backend and the matching legacy anon key", () => {
    expect(() => verifyStagingSupabase("staging", isolatedEnv)).not.toThrow();
    expect(() => verifyStagingSupabase("vercel", {
      ...isolatedEnv, VERCEL_ENV: "preview", VITE_SUPABASE_PUBLISHABLE_KEY: legacyKey("anon", ref),
    })).not.toThrow();
  });

  it("leaves normal local and production builds outside the staging gate", () => {
    expect(() => verifyStagingSupabase("production", {
      VITE_SUPABASE_URL: "https://booking-fixture.invalid",
    })).not.toThrow();
    expect(() => verifyStagingSupabase("vercel", {
      VERCEL_ENV: "production", VITE_SUPABASE_URL: `https://${productionRef}.supabase.co`,
    })).not.toThrow();
  });
});
