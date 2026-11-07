import { describe, expect, it } from "vitest";
import configuration from "../../vercel.json";

const existingAssets = new Set(["/assets/index-Ab12.js", "/assets/index-Ab12.css", "/sw.js"]);

// Vercel serves existing static files before rewrites.
function resolveRequest(url: string): string | undefined {
  const { pathname } = new URL(url, "https://booking.example");
  if (existingAssets.has(pathname)) return pathname;
  return configuration.rewrites.find(({ source }) =>
    new RegExp(`^${source}$`).test(pathname)
  )?.destination;
}

describe("Booking Vercel routing", () => {
  it.each(["/", "/booking", "/booking/", "/auth?redirect=%2Fadmin", "/admin/my"])(
    "preserves the app shell for a direct visit to %s",
    (url) => expect(resolveRequest(url)).toBe("/index.html"),
  );

  it.each([...existingAssets])("serves the static asset %s", (asset) => {
    expect(resolveRequest(`${asset}?v=1`)).toBe(asset);
  });

  it.each(["/assets/missing.js", "/assets/missing.css", "/assets/missing.png",
    "/missing.js", "/missing.css?v=1", "/missing.mjs/"])(
    "lets Vercel return 404 for missing asset %s",
    (asset) => expect(resolveRequest(asset)).toBeUndefined(),
  );
});
