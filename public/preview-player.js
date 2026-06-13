/**
 * Public free-preview player (marketing only — NO seat time, NO heartbeats).
 *
 * Fetches a signed token for a preview-flagged lesson, embeds the Cloudflare
 * Stream player, and hard-stops playback at the lesson's `previewSeconds`,
 * dropping an "enroll to keep watching" overlay. The cap is client-side: the
 * full course stays paywalled, so a teaser is all this protects.
 */
const mount = document.getElementById("preview-player");
if (mount) {
  const lessonId = mount.dataset.lesson;
  const enrollHref = mount.dataset.enrollHref || "";

  const fail = (msg) => {
    mount.innerHTML =
      `<p style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;opacity:0.7;margin:0;text-align:center;padding:1rem">${msg}</p>`;
  };

  const showOverlay = (capMin) => {
    const ov = document.createElement("div");
    ov.style.cssText =
      "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.75rem;background:rgba(20,20,20,0.92);color:#fff;text-align:center;padding:1.5rem";
    const label = enrollHref && enrollHref.startsWith("/learn") ? "Go to your course" : "Enroll to keep watching";
    ov.innerHTML =
      `<strong style="font-size:1.15rem">That's the ${capMin}-minute preview.</strong>` +
      `<p style="margin:0;opacity:0.85;max-width:34ch">Enroll to watch the full lesson and the rest of the course.</p>`;
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.style.cssText =
      "background:var(--accent,#2f6f4f);color:#fff;border:0;border-radius:8px;padding:0.6rem 1.2rem;font-weight:600;cursor:pointer";
    btn.addEventListener("click", () => {
      if (enrollHref) window.location.href = enrollHref;
      else window.scrollTo({ top: 0, behavior: "smooth" });
    });
    ov.appendChild(btn);
    mount.appendChild(ov);
  };

  (async () => {
    let data;
    try {
      const res = await fetch("/api/stream/preview-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lessonId }),
      });
      data = await res.json();
    } catch {
      return fail("Preview unavailable right now.");
    }
    if (!data || !data.ready) return fail("Preview coming soon.");

    const cap = Math.max(5, Number(data.previewSeconds) || 300);
    const capMin = Math.round(cap / 60);

    mount.innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.src = data.urls.iframe;
    iframe.style.cssText = "border:0;width:100%;height:100%";
    iframe.allow = "accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;";
    iframe.allowFullscreen = true;
    mount.appendChild(iframe);

    const s = document.createElement("script");
    s.src = "https://embed.cloudflarestream.com/embed/sdk.latest.js";
    s.addEventListener("load", () => {
      const player = window.Stream(iframe);
      let capped = false;
      // Once capped, re-pause if the viewer tries to resume past the limit.
      player.addEventListener("play", () => {
        if (capped) {
          player.pause();
          try { player.currentTime = cap; } catch {}
        }
      });
      player.addEventListener("timeupdate", () => {
        if (capped) return;
        if (player.currentTime >= cap) {
          capped = true;
          player.pause();
          // Block resuming past the cap.
          try { player.currentTime = cap; } catch {}
          showOverlay(capMin);
        }
      });
    });
    document.head.appendChild(s);
  })();
}
