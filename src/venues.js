// Known venues. Lat/long positions the weather lookup; bearing is the
// direction boats race TOWARDS the finish (degrees true), used to classify
// wind as head / tail / cross relative to the course.
const VENUES = {
  vlc: {
    id: 'vlc',
    name: 'Victoria Lake Club, Germiston',
    lat: -26.22642, lon: 28.16261,
    bearing: 70,               // WSW → ENE
    direction: 'WSW → ENE',
  },
  roodeplaat: {
    id: 'roodeplaat',
    name: 'Alan Francis Rowing Course, Roodeplaat Dam',
    lat: -25.62335, lon: 28.34984,
    bearing: 20,               // SSW → NNE
    direction: 'SSW → NNE',
  },
};

// Classify wind relative to the course. windFrom is the meteorological
// direction the wind blows FROM (degrees). Boats race towards `bearing`.
// A wind blowing FROM the finish direction is a headwind.
function windRelative(windFromDeg, bearing) {
  if (windFromDeg == null || bearing == null) return null;
  const diff = ((windFromDeg - bearing) % 360 + 360) % 360; // 0 = head-on
  if (diff <= 45 || diff >= 315) return 'head';
  if (diff >= 135 && diff <= 225) return 'tail';
  return 'cross';
}

const COMPASS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
function compass(deg) {
  if (deg == null) return '';
  return COMPASS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

// WMO weather code → short label (Open-Meteo uses WMO codes)
function wmoLabel(code) {
  if (code == null) return '';
  if (code === 0) return 'Sunny';
  if (code <= 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code <= 49) return 'Fog';
  if (code <= 59) return 'Drizzle';
  if (code <= 69) return 'Rain';
  if (code <= 79) return 'Snow';
  if (code <= 84) return 'Showers';
  if (code <= 94) return 'Snow showers';
  return 'Thunderstorm';
}

// Fetch current conditions from Open-Meteo (free, no key). Returns null
// on any failure — weather is decoration, never a reason to block a race.
async function fetchConditions(venue) {
  if (!venue || venue.lat == null) return null;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${venue.lat}&longitude=${venue.lon}`
    + `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timezone=Africa%2FJohannesburg`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const j = await res.json();
    const c = j.current || {};
    return {
      airTempC: c.temperature_2m ?? null,
      humidityPct: c.relative_humidity_2m ?? null,
      condition: wmoLabel(c.weather_code),
      windMs: c.wind_speed_10m ?? null,
      windFromDeg: c.wind_direction_10m ?? null,
      windCompass: compass(c.wind_direction_10m),
      windRelative: windRelative(c.wind_direction_10m, venue.bearing),
      source: 'forecast',
      capturedAt: Date.now(),
    };
  } catch (e) {
    return null;
  }
}

function formatConditions(w, waterTempC) {
  if (!w && waterTempC == null) return '';
  const parts = [];
  if (w && w.airTempC != null) parts.push(`Air ${w.airTempC}°C`);
  if (waterTempC != null) parts.push(`Water ${waterTempC}°C`);
  if (w && w.humidityPct != null) parts.push(`Humidity ${w.humidityPct}%`);
  if (w && w.condition) parts.push(w.condition);
  if (w && w.windMs != null) {
    let s = `Wind ${w.windMs} m/s`;
    if (w.windCompass) s += ` ${w.windCompass}`;
    if (w.windRelative) s += ` (${w.windRelative})`;
    parts.push(s);
  }
  return parts.join(' · ');
}

module.exports = { VENUES, fetchConditions, formatConditions, windRelative, compass };
