import { afterEach, describe, expect, it, vi } from "vitest";
import { openMeteo, WeatherError } from "./weather.js";

const geocode = { results: [{ name: "Chicago", latitude: 41.85, longitude: -87.65, admin1: "Illinois", country_code: "US" }] };
const forecast = {
  current: { temperature_2m: 57.9 },
  daily: {
    time: ["2026-10-20", "2026-10-21"],
    temperature_2m_max: [64.8, 66.2],
    temperature_2m_min: [42.8, 42.8],
    precipitation_probability_max: [0, null],
  },
};

function mockFetch(...bodies: unknown[]) {
  const fn = vi.fn();
  for (const b of bodies) fn.mockResolvedValueOnce(new Response(JSON.stringify(b)));
  vi.stubGlobal("fetch", fn);
  return fn;
}
afterEach(() => vi.unstubAllGlobals());

describe("openMeteo", () => {
  it("geocodes, then returns today's forecast in °F with the current temperature", async () => {
    const fetch = mockFetch(geocode, forecast);
    expect(await openMeteo.getWeather("Chicago")).toEqual({
      location: "Chicago, Illinois, US", date: "2026-10-20", highF: 65, lowF: 43, currentF: 58, precipitationChancePct: 0,
    });
    expect(String(fetch.mock.calls[1]![0])).toContain("temperature_unit=fahrenheit");
  });

  it("returns a specific day without a current temperature", async () => {
    mockFetch(geocode, forecast);
    const r = await openMeteo.getWeather("Chicago", "2026-10-21");
    expect(r).toMatchObject({ date: "2026-10-21", highF: 66, precipitationChancePct: null });
    expect(r.currentF).toBeUndefined();
  });

  it("rejects unknown locations and out-of-range dates", async () => {
    mockFetch({});
    await expect(openMeteo.getWeather("Nowhereville")).rejects.toThrow(WeatherError);
    mockFetch(geocode, forecast);
    await expect(openMeteo.getWeather("Chicago", "2027-01-01")).rejects.toThrow(/next 7 days/);
  });
});
