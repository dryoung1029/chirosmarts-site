/**
 * Lesson player client (compliance req 1 & 2).
 *
 * Drives seat-time accrual from real playback: while the video plays in a
 * FOCUSED tab, it samples the content position and periodically POSTs append-only
 * heartbeats carrying the contiguous [start,end] interval covered. Seeks and
 * pauses break the interval so skipped/idle time is never credited. Each
 * heartbeat renews the single-device playback lease; a 409 means another device
 * took over, so we pause and tell the user.
 *
 * Two player adapters share one engine:
 *   - StreamAdapter: the real Cloudflare Stream player (signed token).
 *   - SimAdapter: a local dev simulator used when no video / no Stream keys, so
 *     the whole pipeline is testable without uploading anything.
 */

const cfg = JSON.parse(document.getElementById("lesson-config").textContent);
const statusEl = document.getElementById("status");
const creditedEl = document.getElementById("credited");
const barEl = document.getElementById("bar");
const completeEl = document.getElementById("complete");

const POLL_MS = 1000;
const HEARTBEAT_MS = 20000; // ~1 beat / 20s of continuous play
const SEEK_EPS = 1.5; // backward jump > this = a seek

function deviceId() {
  let id = localStorage.getItem("cs_device_id");
  if (!id) {
    id = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("cs_device_id", id);
  }
  return id;
}
const DEVICE = deviceId();

function showStatus(msg, kind) {
  statusEl.textContent = msg;
  statusEl.className = "notice " + (kind || "warn");
  statusEl.style.display = msg ? "block" : "none";
}

function renderProgress(p) {
  if (!p) return;
  creditedEl.textContent = (p.creditedSeconds / 60).toFixed(1);
  const pct = p.durationSeconds
    ? Math.min(100, Math.round((p.creditedSeconds / p.durationSeconds) * 100))
    : 0;
  barEl.style.width = pct + "%";
  completeEl.textContent = p.complete ? "✓ complete" : "";
}

// --- Heartbeat engine ------------------------------------------------------
let runStart = null; // start of the current contiguous coverage run
let runEnd = null; // latest sampled position in the run
let lastBeatAt = 0;
let leaseOk = true;

async function acquireLease() {
  try {
    const res = await fetch("/api/playback/lease", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lessonId: cfg.lessonId, deviceId: DEVICE }),
    });
    if (res.status === 409) {
      leaseOk = false;
      showStatus("Playback is active on another device. Pausing here.", "err");
      return false;
    }
    leaseOk = true;
    showStatus("", "");
    return true;
  } catch {
    return false;
  }
}

async function sendBeat(start, end, opts) {
  if (end - start <= 0.05) return;
  try {
    const res = await fetch(
      "/api/lessons/" + encodeURIComponent(cfg.lessonId) + "/heartbeat",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId: DEVICE,
          positionStart: start,
          positionEnd: end,
          wallSeconds: opts.wallSeconds,
          playbackRate: opts.rate,
        }),
      },
    );
    if (res.status === 409) {
      leaseOk = false;
      adapter.pause();
      showStatus("Playback is active on another device. Pausing here.", "err");
      return;
    }
    if (res.ok) {
      const data = await res.json();
      renderProgress(data.progress);
      leaseOk = true;
      showStatus("", "");
    }
  } catch {
    /* network blip — keep accumulating; next beat retries */
  }
}

function flushRun(rate) {
  if (runStart != null && runEnd != null && runEnd > runStart) {
    sendBeat(runStart, runEnd, { wallSeconds: (runEnd - runStart) / (rate || 1), rate });
  }
  runStart = null;
  runEnd = null;
}

let adapter; // set after token resolution

async function tick() {
  const playing = adapter.isPlaying();
  // Tab must be visible. We deliberately do NOT use document.hasFocus(): the
  // Stream player is a cross-origin iframe, so interacting with it (play/seek)
  // moves focus INTO the iframe and would make hasFocus() report the page as
  // unfocused — which previously froze seat-time while the user was actively
  // watching or scrubbing. Visibility is the right anti-background-tab gate.
  const focused = document.visibilityState === "visible";
  const rate = adapter.getRate();
  const pos = adapter.getCurrentTime();

  if (!playing || !focused) {
    // Idle or backgrounded — bank whatever run we have and stop accruing.
    flushRun(rate);
    lastBeatAt = 0;
    return;
  }

  if (!leaseOk) {
    // Lost the lease earlier; try to reclaim before counting.
    const ok = await acquireLease();
    if (!ok) {
      adapter.pause();
      return;
    }
  }

  if (runStart == null) {
    runStart = pos;
    runEnd = pos;
    lastBeatAt = Date.now();
  } else if (pos < runEnd - SEEK_EPS || pos > runEnd + maxStep(rate)) {
    // Seek (back, or a forward jump bigger than playback could produce): break
    // the run so the skipped span is not credited.
    flushRun(rate);
    runStart = pos;
    runEnd = pos;
    lastBeatAt = Date.now();
  } else {
    runEnd = pos;
  }

  // Periodic flush during long continuous play (keeps the server current).
  if (runStart != null && Date.now() - lastBeatAt >= HEARTBEAT_MS) {
    const s = runStart;
    const e = runEnd;
    sendBeat(s, e, { wallSeconds: (e - s) / (rate || 1), rate });
    runStart = runEnd; // continue the run from here
    lastBeatAt = Date.now();
  }
}

function maxStep(rate) {
  // Largest plausible forward move between polls at this rate, plus slack.
  return (POLL_MS / 1000) * (rate || 1) * 3 + SEEK_EPS;
}

// Flush on tab hide / unload so the last partial segment is recorded.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushRun(adapter?.getRate() || 1);
});
window.addEventListener("pagehide", () => flushRun(adapter?.getRate() || 1));

// --- Adapters --------------------------------------------------------------
function SimAdapter(mount) {
  let current = Math.min(cfg.resumeSeconds || 0, cfg.durationSeconds);
  let playing = false;
  let rate = 1;
  const dur = cfg.durationSeconds;

  mount.innerHTML = `
    <div style="height:100%;display:flex;flex-direction:column;justify-content:center;gap:0.75rem;padding:1.25rem;color:#e2e8f0;font-family:system-ui">
      <div style="font-size:0.85rem;color:#94a3b8">Dev simulator (no video uploaded). Seat-time pipeline is live.</div>
      <div style="display:flex;align-items:center;gap:0.75rem">
        <button id="sim-play" style="background:#0ea5e9;color:#fff;border:0;border-radius:8px;padding:0.5rem 1rem;cursor:pointer">Play</button>
        <span id="sim-time" style="font-variant-numeric:tabular-nums"></span>
        <label style="margin:0;color:#94a3b8;font-size:0.85rem">rate
          <select id="sim-rate" style="margin-left:0.3rem">
            <option value="1">1x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
          </select>
        </label>
        <button id="sim-skip" title="dev: jump 60s of coverage" style="margin-left:auto;background:#334155;color:#e2e8f0;border:0;border-radius:8px;padding:0.5rem 0.8rem;cursor:pointer">dev +60s</button>
      </div>
      <input id="sim-seek" type="range" min="0" max="${dur}" step="1" value="${current}" />
    </div>`;

  const timeEl = mount.querySelector("#sim-time");
  const seekEl = mount.querySelector("#sim-seek");
  const playBtn = mount.querySelector("#sim-play");
  const rateSel = mount.querySelector("#sim-rate");

  function fmt(s) {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60).toString().padStart(2, "0");
    return m + ":" + ss;
  }
  function paint() {
    timeEl.textContent = fmt(current) + " / " + fmt(dur);
    seekEl.value = String(Math.floor(current));
  }
  paint();

  playBtn.addEventListener("click", () => {
    playing = !playing;
    playBtn.textContent = playing ? "Pause" : "Play";
    if (playing) acquireLease();
  });
  rateSel.addEventListener("change", () => (rate = parseFloat(rateSel.value)));
  seekEl.addEventListener("input", () => {
    current = parseFloat(seekEl.value);
    paint();
  });
  mount.querySelector("#sim-skip").addEventListener("click", () => {
    // Emit a heartbeat covering the next 60s of content (dev convenience).
    const start = current;
    const end = Math.min(dur, current + 60);
    sendBeat(start, end, { wallSeconds: (end - start) / rate, rate });
    current = end;
    paint();
  });

  // Synthetic clock: advance while playing.
  setInterval(() => {
    if (playing && current < dur) {
      current = Math.min(dur, current + rate * (POLL_MS / 1000));
      if (current >= dur) {
        playing = false;
        playBtn.textContent = "Play";
      }
      paint();
    }
  }, POLL_MS);

  return {
    isPlaying: () => playing,
    getCurrentTime: () => current,
    getRate: () => rate,
    pause: () => {
      playing = false;
      playBtn.textContent = "Play";
    },
  };
}

function StreamAdapter(mount, iframeUrl) {
  const iframe = document.createElement("iframe");
  iframe.src = iframeUrl;
  iframe.style.cssText = "border:0;width:100%;height:100%";
  iframe.allow = "accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;";
  iframe.allowFullscreen = true;
  mount.appendChild(iframe);

  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://embed.cloudflarestream.com/embed/sdk.latest.js";
    s.onload = () => {
      const player = window.Stream(iframe);
      let resumed = false;
      player.addEventListener("loadedmetadata", () => {
        if (!resumed) {
          // Resume where they left off — but never park them at the very end
          // (a finished video would otherwise reopen stuck on the last frame).
          const r = cfg.resumeSeconds;
          if (r > 5 && r < cfg.durationSeconds - 15) player.currentTime = r;
          resumed = true;
        }
        if (player.playbackRate > cfg.maxPlaybackRate) {
          player.playbackRate = cfg.maxPlaybackRate;
        }
      });
      player.addEventListener("play", acquireLease);
      resolve({
        isPlaying: () => !player.paused,
        getCurrentTime: () => player.currentTime || 0,
        getRate: () => Math.min(player.playbackRate || 1, cfg.maxPlaybackRate),
        pause: () => player.pause(),
      });
    };
    document.head.appendChild(s);
  });
}

// --- Boot ------------------------------------------------------------------
async function boot() {
  const mount = document.getElementById("player");
  let useSim = true;
  let iframeUrl = null;

  try {
    const res = await fetch("/api/stream/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lessonId: cfg.lessonId }),
    });
    const data = await res.json();
    if (data.ready && data.urls) {
      useSim = false;
      iframeUrl = data.urls.iframe;
    }
  } catch {
    /* fall through to simulator */
  }

  adapter = useSim ? SimAdapter(mount) : await StreamAdapter(mount, iframeUrl);
  setInterval(tick, POLL_MS);
}

boot();
