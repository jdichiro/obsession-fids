// app.js — Obsession Pizza FIDS — MCO
(function () {
  "use strict";

  var API_ENDPOINT  = "/.netlify/functions/flights";
  var POLL_INTERVAL = 90000;
  var WEATHER_URL   = "https://api.open-meteo.com/v1/forecast?latitude=28.4294&longitude=-81.3089&current_weather=true&temperature_unit=fahrenheit&windspeed_unit=mph";
  var INSTAGRAM     = "12.4K";

  var lastGoodData = null;
  var weatherCache = null;
  var pollTimer    = null;

  var clockEl    = document.getElementById("clock");
  var dateEl     = document.getElementById("date-display");
  var arrList    = document.getElementById("arrivals-list");
  var depList    = document.getElementById("departures-list");
  var sourceEl   = document.getElementById("data-source");
  var weatherEl  = document.getElementById("weather-value");
  var weatherSub = document.getElementById("weather-sub");
  var igEl       = document.getElementById("ig-value");
  var tickerEl   = document.getElementById("ticker-tape");

  // ── Reloj ────────────────────────────────────────────────────────
  function updateClock() {
    var now = new Date();
    var h = String(now.getHours()).padStart(2, "0");
    var m = String(now.getMinutes()).padStart(2, "0");
    var s = String(now.getSeconds()).padStart(2, "0");
    if (clockEl) {
      clockEl.innerHTML = h + '<span class="colon-blink">:</span>' + m +
        '<span style="font-size:0.6em;opacity:0.45;margin-left:2px">:' + s + '</span>';
    }
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric"
      }).toUpperCase();
    }
  }

  // ── Status ───────────────────────────────────────────────────────
  var STATUS_MAP = {
    "on time":   { cls: "on-time",   label: "On Time"   },
    "boarding":  { cls: "boarding",  label: "Boarding"  },
    "delayed":   { cls: "delayed",   label: "Delayed"   },
    "cancelled": { cls: "cancelled", label: "Cancelled" },
    "in flight": { cls: "in-flight", label: "In Flight" },
    "landed":    { cls: "landed",    label: "Landed"    },
    "diverted":  { cls: "delayed",   label: "Diverted"  }
  };

  function statusInfo(raw) {
    return STATUS_MAP[(raw || "").toLowerCase()] || { cls: "on-time", label: raw || "On Time" };
  }

  function rowLeftBorder(raw) {
    var k = (raw || "").toLowerCase();
    if (k === "boarding")  return "status-boarding";
    if (k === "delayed" || k === "diverted") return "status-delayed";
    if (k === "cancelled") return "status-cancelled";
    return "";
  }

  function escHtml(v) {
    return String(v == null ? "" : v)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  // ── Render ───────────────────────────────────────────────────────
  function renderRows(el, flights) {
    if (!el) return;
    if (!Array.isArray(flights) || flights.length === 0) {
      el.innerHTML = '<div class="flight-row empty-row">NO DATA AVAILABLE</div>';
      return;
    }
    var html = "";
    for (var i = 0; i < flights.length; i++) {
      var f  = flights[i];
      var st = statusInfo(f.status);
      var rc = rowLeftBorder(f.status);
      html +=
        '<div class="flight-row ' + rc + '" style="animation-delay:' + (i * 50) + 'ms">' +
          '<div class="cell-flight">' + escHtml(f.flightNumber) + '</div>' +
          '<div class="cell-city">'   + escHtml(f.city)         + '</div>' +
          '<div class="cell-time">'   + escHtml(f.time)         + '</div>' +
          '<div class="cell-status"><span class="status-badge ' + st.cls + '">' + st.label + '</span></div>' +
        '</div>';
    }
    el.innerHTML = html;
  }

  function buildTicker(arr, dep) {
    if (!tickerEl) return;
    var items = [];
    for (var i = 0; i < arr.length; i++)
      items.push("✈ ARR  " + arr[i].flightNumber + "  " + arr[i].city + "  " + arr[i].time);
    for (var j = 0; j < dep.length; j++)
      items.push("✈ DEP  " + dep[j].flightNumber + "  " + dep[j].city + "  " + dep[j].time);
    if (!items.length) return;
    var t = items.join("   ·   ");
    tickerEl.textContent = t + "   ·   " + t;
  }

  function showData(data, label) {
    renderRows(arrList, data.arrivals);
    renderRows(depList, data.departures);
    buildTicker(data.arrivals, data.departures);
    if (sourceEl)
      sourceEl.textContent = "MCO · " + label + " · " + new Date().toLocaleTimeString();
  }

  // ── Fetch vuelos ─────────────────────────────────────────────────
  function fetchFlights() {
    fetch(API_ENDPOINT, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.arrivals) || !Array.isArray(data.departures))
          throw new Error("Forma inválida");
        if (data.arrivals.length === 0 && data.departures.length === 0)
          throw new Error("Dataset vacío");
        lastGoodData = data;
        showData(data, "LIVE");
      })
      .catch(function (err) {
        console.warn("[FIDS]", err.message);
        if (lastGoodData) {
          showData(lastGoodData, "CACHE");
        } else {
          // Mostrar mensaje claro — nunca datos inventados
          if (arrList) arrList.innerHTML = '<div class="flight-row empty-row">CONNECTING TO MCO DATA...</div>';
          if (depList) depList.innerHTML = '<div class="flight-row empty-row">CONNECTING TO MCO DATA...</div>';
          if (sourceEl) sourceEl.textContent = "MCO · RECONNECTING... · " + new Date().toLocaleTimeString();
        }
      });
  }

  // ── Weather ──────────────────────────────────────────────────────
  function fetchWeather() {
    if (!weatherEl) return;
    fetch(WEATHER_URL, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var cw = data && data.current_weather;
        if (!cw) throw new Error("no weather");
        var tempF = Math.round(cw.temperature);
        var icon  = wmoIcon(cw.weathercode || 0);
        var wind  = Math.round(cw.windspeed);
        weatherCache = { tempF: tempF, icon: icon, wind: wind };
        weatherEl.textContent = icon + " " + tempF + "°F";
        if (weatherSub) weatherSub.textContent = "WIND " + wind + " MPH · ORLANDO";
      })
      .catch(function () {
        if (weatherCache) {
          weatherEl.textContent = weatherCache.icon + " " + weatherCache.tempF + "°F";
        } else {
          weatherEl.textContent = "--°F";
          if (weatherSub) weatherSub.textContent = "WEATHER UNAVAILABLE";
        }
      });
  }

  function wmoIcon(c) {
    if (c === 0) return "☀️";
    if (c <= 3)  return "⛅";
    if (c <= 49) return "🌫️";
    if (c <= 69) return "🌧️";
    if (c <= 82) return "🌧️";
    if (c <= 86) return "❄️";
    if (c <= 99) return "⛈️";
    return "🌤️";
  }

  // ── Init ─────────────────────────────────────────────────────────
  function init() {
    // Mostrar "conectando" — nunca datos inventados
    if (arrList) arrList.innerHTML = '<div class="flight-row empty-row">LOADING MCO ARRIVALS...</div>';
    if (depList) depList.innerHTML = '<div class="flight-row empty-row">LOADING MCO DEPARTURES...</div>';

    updateClock();
    setInterval(updateClock, 1000);

    if (igEl) igEl.textContent = INSTAGRAM;

    fetchFlights();
    fetchWeather();

    pollTimer = setInterval(fetchFlights, POLL_INTERVAL);
    setInterval(fetchWeather, 600000);

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        clearInterval(pollTimer);
        fetchFlights();
        pollTimer = setInterval(fetchFlights, POLL_INTERVAL);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
