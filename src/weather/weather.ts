import { z } from "zod";

export interface WeatherReport {
  location: string;
  date: string; // YYYY-MM-DD, local to the location
  highF: number;
  lowF: number;
  /** Only present for today's forecast. */
  currentF?: number;
  precipitationChancePct: number | null;
}

export class WeatherError extends Error {}

/** Abstracted so tests and evals can use fixed weather instead of live forecasts. */
export interface WeatherProvider {
  getWeather(location: string, date?: string): Promise<WeatherReport>;
}

const GeocodeSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        admin1: z.string().optional(),
        country_code: z.string().optional(),
      }),
    )
    .optional(),
});

const ForecastSchema = z.object({
  current: z.object({ temperature_2m: z.number() }).optional(),
  daily: z.object({
    time: z.array(z.string()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
    precipitation_probability_max: z.array(z.number().nullable()),
  }),
});

const FORECAST_DAYS = 7;

async function getJson(url: URL): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new WeatherError(`Weather service returned ${res.status}`);
  return res.json();
}

/** Open-Meteo: free, no API key. https://open-meteo.com */
export const openMeteo: WeatherProvider = {
  async getWeather(location, date) {
    const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geoUrl.search = new URLSearchParams({ name: location, count: "1", language: "en", format: "json" }).toString();
    const place = GeocodeSchema.parse(await getJson(geoUrl)).results?.[0];
    if (!place) throw new WeatherError(`Unknown location: ${location}`);

    const fcUrl = new URL("https://api.open-meteo.com/v1/forecast");
    fcUrl.search = new URLSearchParams({
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      current: "temperature_2m",
      daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      temperature_unit: "fahrenheit",
      timezone: "auto",
      forecast_days: String(FORECAST_DAYS),
    }).toString();
    const fc = ForecastSchema.parse(await getJson(fcUrl));

    const i = date ? fc.daily.time.indexOf(date) : 0;
    if (i < 0) throw new WeatherError(`No forecast for ${date}; only the next ${FORECAST_DAYS} days are available.`);
    return {
      location: [place.name, place.admin1, place.country_code].filter(Boolean).join(", "),
      date: fc.daily.time[i]!,
      highF: Math.round(fc.daily.temperature_2m_max[i]!),
      lowF: Math.round(fc.daily.temperature_2m_min[i]!),
      ...(i === 0 && fc.current ? { currentF: Math.round(fc.current.temperature_2m) } : {}),
      precipitationChancePct: fc.daily.precipitation_probability_max[i] ?? null,
    };
  },
};

/** Deterministic provider for tests and evals. */
export function fixedWeather(reports: Record<string, Omit<WeatherReport, "location" | "date">>): WeatherProvider {
  return {
    async getWeather(location, date) {
      const r = reports[location.toLowerCase()];
      if (!r) throw new WeatherError(`Unknown location: ${location}`);
      return { location, date: date ?? "2026-01-15", ...r };
    },
  };
}
