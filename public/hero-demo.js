/**
 * Hero demo timeline controller (≤30KB target; this is ~2KB).
 * Drives the staged dashboard animation in HeroDemo.astro by adding milestone
 * classes (s1..s6) cumulatively, counting the course ring 0→8.0, then looping
 * with a crossfade. Honors prefers-reduced-motion (renders the final static
 * composition) and pauses when scrolled off-screen (IntersectionObserver).
 */
const el = document.querySelector("[data-hero-demo]");
if (el) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ringNum = el.querySelector(".ring-num");

  if (reduce) {
    el.classList.add("static");
    if (ringNum) ringNum.textContent = "8.0";
  } else {
    // Timeline: [delayMsFromPrev, milestoneClass]
    const STEPS = [
      [600, "s1"], // checklist appears
      [3800, "s2"], // course ring fills (handled below)
      [5800, "s3"], // hands-on signed
      [3600, "s4"], // exam passed
      [3600, "s5"], // certificate slides in
      [4200, "s6"], // maintain mode + toast
      [4600, "loop"], // crossfade + reset
    ];

    let idx = 0;
    let timer = null;
    let ringRaf = null;
    let running = false;

    function clearAll() {
      el.classList.remove("s1", "s2", "s3", "s4", "s5", "s6", "fade");
      if (ringNum) ringNum.textContent = "0.0";
    }

    function animateRing() {
      const start = performance.now();
      const dur = 2600;
      function frame(now) {
        const t = Math.min(1, (now - start) / dur);
        if (ringNum) ringNum.textContent = (t * 8).toFixed(1);
        if (t < 1 && running) ringRaf = requestAnimationFrame(frame);
      }
      ringRaf = requestAnimationFrame(frame);
    }

    function next() {
      if (!running) return;
      const [delay, cls] = STEPS[idx];
      timer = setTimeout(() => {
        if (cls === "loop") {
          el.classList.add("fade");
          setTimeout(() => {
            clearAll();
            idx = 0;
            next();
          }, 520);
          return;
        }
        el.classList.add(cls);
        if (cls === "s2") animateRing();
        idx++;
        next();
      }, delay);
    }

    function start() {
      if (running) return;
      running = true;
      next();
    }
    function stop() {
      running = false;
      if (timer) clearTimeout(timer);
      if (ringRaf) cancelAnimationFrame(ringRaf);
    }

    // Pause when off-screen.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) start();
          else stop();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
  }
}
