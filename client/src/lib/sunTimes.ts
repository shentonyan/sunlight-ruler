import * as SunCalc from "suncalc";

export type SunTimes = { sunrise: number; sunset: number };

function dateParts(date: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (kind: string) => Number(parts.find((part) => part.type === kind)?.value ?? 0);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

function localNoonAsUtc(date: Date, zone: string) {
  const local = dateParts(date, zone);
  const target = Date.UTC(local.year, local.month - 1, local.day, 12);
  let timestamp = target;
  for (let i = 0; i < 2; i += 1) {
    const shifted = dateParts(new Date(timestamp), zone);
    const shiftedNoon = Date.UTC(shifted.year, shifted.month - 1, shifted.day, 12);
    timestamp += target - shiftedNoon;
  }
  return new Date(timestamp);
}

function minutesInZone(date: Date, zone: string) {
  const local = dateParts(date, zone);
  return local.hour * 60 + local.minute + local.second / 60;
}

export function getSunTimes(date: Date, latitude: number, longitude: number, zone: string): SunTimes | null {
  const times = SunCalc.getTimes(localNoonAsUtc(date, zone), latitude, longitude);
  if (!times.sunrise || !times.sunset || !Number.isFinite(times.sunrise.getTime()) || !Number.isFinite(times.sunset.getTime())) return null;
  const sunrise = minutesInZone(times.sunrise, zone);
  const sunset = minutesInZone(times.sunset, zone);
  if (!Number.isFinite(sunrise) || !Number.isFinite(sunset) || sunset <= sunrise) return null;
  return { sunrise, sunset };
}
