// netlify/functions/flights.js
// Proxy seguro para AviationStack — la API key NUNCA llega al browser

const https = require("https");

// ── Cache en memoria ──────────────────────────────────────────────
let cache = { data: null, ts: 0, TTL: 90000 };

// ── Fallback estático con vuelos reales típicos de MCO ────────────
const FALLBACK = {
  _source: "fallback",
  arrivals: [
    { flightNumber: "AA 2456", city: "New York (JFK)",       time: "07:55", status: "On Time"  },
    { flightNumber: "DL 1842", city: "Atlanta (ATL)",         time: "08:20", status: "On Time"  },
    { flightNumber: "UA 1504", city: "Chicago (ORD)",         time: "08:50", status: "Delayed"  },
    { flightNumber: "WN 3421", city: "Baltimore (BWI)",       time: "09:10", status: "On Time"  },
    { flightNumber: "B6 2031", city: "Boston (BOS)",          time: "09:35", status: "On Time"  },
    { flightNumber: "AA 1733", city: "Dallas (DFW)",          time: "10:05", status: "On Time"  },
    { flightNumber: "NK 412",  city: "Fort Lauderdale (FLL)", time: "10:30", status: "On Time"  },
    { flightNumber: "F9 721",  city: "Denver (DEN)",          time: "11:00", status: "On Time"  }
  ],
  departures: [
    { flightNumber: "AA 2101", city: "Los Angeles (LAX)",     time: "07:40", status: "Boarding" },
    { flightNumber: "DL 2234", city: "Atlanta (ATL)",         time: "08:15", status: "On Time"  },
    { flightNumber: "UA 2876", city: "Newark (EWR)",          time: "08:45", status: "On Time"  },
    { flightNumber: "WN 4512", city: "Nashville (BNA)",       time: "09:00", status: "On Time"  },
    { flightNumber: "B6 1122", city: "San Juan (SJU)",        time: "09:25", status: "Delayed"  },
    { flightNumber: "AA 3301", city: "Miami (MIA)",           time: "09:55", status: "On Time"  },
    { flightNumber: "NK 831",  city: "Philadelphia (PHL)",    time: "10:20", status: "On Time"  },
    { flightNumber: "F9 334",  city: "Charlotte (CLT)",       time: "10:50", status: "On Time"  }
  ]
};

// ── Helper: HTTP GET con timeout ──────────────────────────────────
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch (e) { reject(new Error("JSON parse error: " + e.message)); }
      });
    });
    req.on("error", reject);
    req.setTimeout(9000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

// ── Formatear hora HH:MM ─────────────────────────────────────────
function fmtTime(str) {
  if (!str) return "--:--";
  const m = str.match(/T(\d{2}):(\d{2})/);
  if (m) return m[1] + ":" + m[2];
  const m2 = str.match(/(\d{2}):(\d{2})/);
  if (m2) return m2[1] + ":" + m2[2];
  return "--:--";
}

// ── Resolver status legible ───────────────────────────────────────
function resolveStatus(f) {
  const s = (f.flight_status || "").toLowerCase();
  if (s === "active")    return "In Flight";
  if (s === "landed")    return "Landed";
  if (s === "cancelled") return "Cancelled";
  if (s === "diverted")  return "Diverted";
  if (s === "delayed")   return "Delayed";
  // scheduled → ver si está por salir
  const depTime = f.departure && (f.departure.estimated || f.departure.scheduled);
  if (depTime) {
    const diff = new Date(depTime) - Date.now();
    if (diff > 0 && diff < 25 * 60 * 1000) return "Boarding";
  }
  return "On Time";
}

// ── Nombre de ciudad desde objeto airport ────────────────────────
function cityLabel(airport) {
  if (!airport) return "Unknown";
  const city = airport.municipality || airport.city || airport.name || "Unknown";
  const iata = airport.iata ? " (" + airport.iata + ")" : "";
  return city + iata;
}

// ── Normalizar respuesta de AviationStack ────────────────────────
function normalize(arrData, depData) {
  const arrivals = [];
  const departures = [];

  (arrData.data || []).forEach((f) => {
    if (!f.flight || !f.flight.iata) return;
    arrivals.push({
      flightNumber: f.flight.iata,
      city:   cityLabel(f.departure && f.departure.airport ? f.departure.airport : { iata: f.departure && f.departure.iata }),
      time:   fmtTime(f.arrival && (f.arrival.estimated || f.arrival.scheduled)),
      status: resolveStatus(f)
    });
  });

  (depData.data || []).forEach((f) => {
    if (!f.flight || !f.flight.iata) return;
    departures.push({
      flightNumber: f.flight.iata,
      city:   cityLabel(f.arrival && f.arrival.airport ? f.arrival.airport : { iata: f.arrival && f.arrival.iata }),
      time:   fmtTime(f.departure && (f.departure.estimated || f.departure.scheduled)),
      status: resolveStatus(f)
    });
  });

  if (arrivals.length === 0 && departures.length === 0) {
    throw new Error("Empty dataset after normalization");
  }

  return {
    arrivals:   arrivals.slice(0, 10),
    departures: departures.slice(0, 10)
  };
}

// ── Handler principal ─────────────────────────────────────────────
exports.handler = async function (event) {
  const headers = {
    "Content-Type":                "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control":               "no-store"
  };

  // Servir desde cache si está fresco
  if (cache.data && Date.now() - cache.ts < cache.TTL) {
    return { statusCode: 200, headers, body: JSON.stringify({ ...cache.data, _source: "cache" }) };
  }

  const key = process.env.AVIATION_API_KEY;
  if (!key) {
    console.warn("[flights] AVIATION_API_KEY no configurada — usando fallback");
    return { statusCode: 200, headers, body: JSON.stringify(FALLBACK) };
  }

  const base   = "https://api.aviationstack.com/v1/flights";
  const arrUrl = base + "?access_key=" + key + "&arr_iata=MCO&limit=20";
  const depUrl = base + "?access_key=" + key + "&dep_iata=MCO&limit=20";

  try {
    console.log("[flights] Llamando AviationStack...");
    const [arrRes, depRes] = await Promise.all([fetchJson(arrUrl), fetchJson(depUrl)]);

    // Detectar errores de la API (plan gratis devuelve 200 con error en body)
    if (arrRes.body && arrRes.body.error) {
      throw new Error("API error: " + JSON.stringify(arrRes.body.error));
    }

    const normalized = normalize(arrRes.body, depRes.body);
    cache.data = normalized;
    cache.ts   = Date.now();

    console.log("[flights] OK — arr:" + normalized.arrivals.length + " dep:" + normalized.departures.length);
    return { statusCode: 200, headers, body: JSON.stringify({ ...normalized, _source: "live" }) };

  } catch (err) {
    console.error("[flights] Error:", err.message);

    if (cache.data) {
      console.log("[flights] Sirviendo cache stale");
      return { statusCode: 200, headers, body: JSON.stringify({ ...cache.data, _source: "stale" }) };
    }

    console.log("[flights] Sirviendo fallback estático");
    return { statusCode: 200, headers, body: JSON.stringify(FALLBACK) };
  }
};
