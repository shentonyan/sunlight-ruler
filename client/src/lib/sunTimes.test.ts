import { describe, expect, it } from "vitest";
import { getSunTimes } from "./sunTimes";

describe("getSunTimes", () => {
  it("accounts for seasonal changes in Shanghai", () => {
    const summer = getSunTimes(new Date("2026-06-21T04:00:00Z"), 31.2304, 121.4737, "Asia/Shanghai");
    const winter = getSunTimes(new Date("2026-12-21T04:00:00Z"), 31.2304, 121.4737, "Asia/Shanghai");
    expect(summer).not.toBeNull();
    expect(winter).not.toBeNull();
    expect(summer!.sunrise).toBeLessThan(winter!.sunrise);
    expect(summer!.sunset - summer!.sunrise).toBeGreaterThan(winter!.sunset - winter!.sunrise);
  });

  it("returns local wall-clock minutes for the requested time zone", () => {
    const paris = getSunTimes(new Date("2026-06-21T00:00:00Z"), 48.8566, 2.3522, "Europe/Paris");
    const newYork = getSunTimes(new Date("2026-06-21T00:00:00Z"), 40.7128, -74.006, "America/New_York");
    expect(paris!.sunrise).toBeGreaterThan(5 * 60);
    expect(paris!.sunrise).toBeLessThan(6 * 60);
    expect(newYork!.sunrise).toBeGreaterThan(5 * 60);
    expect(newYork!.sunrise).toBeLessThan(5 * 60 + 45);
  });

  it("rejects dates without a usable sunrise and sunset", () => {
    expect(getSunTimes(new Date("2026-06-21T00:00:00Z"), 89, 0, "UTC")).toBeNull();
  });
});
