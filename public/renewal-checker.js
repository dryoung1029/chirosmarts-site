/**
 * Renewal-checker island (~1.5KB). Deadlines are precomputed server-side and
 * embedded as JSON; this just looks up the selected month + renewal status,
 * renders the result, and wires the optional double-opt-in email capture. The
 * result shows without an email — the value isn't gated behind the capture.
 */
const root = document.querySelector("[data-renewal-checker]");
if (root) {
  const data = JSON.parse(root.querySelector("[data-renewal-data]").textContent);
  const monthSel = root.querySelector("[data-month]");
  const renewedBefore = root.querySelector("[data-renewed-before]");
  const result = root.querySelector("[data-result]");
  const deadlineEl = root.querySelector("[data-deadline]");
  const hoursEl = root.querySelector("[data-hours]");
  const noteEl = root.querySelector("[data-note]");

  function placeholderHours() {
    const span = document.createElement("span");
    span.className = "owner-copy";
    span.textContent = "[OWNER COPY: required CE hours]";
    return span;
  }

  function render() {
    const m = Number(monthSel.value);
    if (!m) {
      result.hidden = true;
      return;
    }
    result.hidden = false;
    deadlineEl.textContent = data.deadlines[m] || "the last day of your birth month";
    const hrs = renewedBefore.checked ? data.subsequentHours : data.firstHours;
    hoursEl.textContent = "";
    if (hrs == null) hoursEl.appendChild(placeholderHours());
    else hoursEl.textContent = `${hrs} hour${hrs === 1 ? "" : "s"}`;
    if (data.note) {
      noteEl.hidden = false;
      noteEl.textContent = data.note;
    }
  }

  monthSel.addEventListener("change", render);
  renewedBefore.addEventListener("change", render);

  // Email capture (optional) → double opt-in.
  const form = root.querySelector("[data-capture]");
  const emailEl = root.querySelector("[data-email]");
  const msgEl = root.querySelector("[data-capture-msg]");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailEl.value.trim();
    if (!email) return;
    const btn = form.querySelector("button");
    btn.disabled = true;
    msgEl.hidden = false;
    msgEl.textContent = "Sending…";
    try {
      const res = await fetch("/api/leads/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          source: "renewal_checker",
          birthMonth: Number(monthSel.value) || null,
        }),
      });
      const out = await res.json().catch(() => ({}));
      msgEl.textContent = out.message || (res.ok ? "Check your email to confirm." : "Something went wrong.");
      msgEl.style.color = res.ok ? "var(--ok)" : "var(--warn)";
      if (res.ok) emailEl.value = "";
    } catch {
      msgEl.textContent = "Network error. Please try again.";
      msgEl.style.color = "var(--warn)";
    } finally {
      btn.disabled = false;
    }
  });
}
