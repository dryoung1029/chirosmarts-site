/** Wires every [data-lead-capture] form → POST /api/leads/capture (double opt-in). */
document.querySelectorAll("[data-lead-capture]").forEach((root) => {
  const form = root.querySelector("[data-lc-form]");
  const email = root.querySelector("[data-lc-email]");
  const msg = root.querySelector("[data-lc-msg]");
  const source = root.getAttribute("data-source") || "other";
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = email.value.trim();
    if (!value) return;
    const btn = form.querySelector("button");
    btn.disabled = true;
    msg.hidden = false;
    msg.textContent = "Sending…";
    try {
      const res = await fetch("/api/leads/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: value, source }),
      });
      const out = await res.json().catch(() => ({}));
      msg.textContent = out.message || (res.ok ? "Check your email to confirm." : "Something went wrong.");
      msg.style.color = res.ok ? "var(--ok)" : "var(--warn)";
      if (res.ok) email.value = "";
    } catch {
      msg.textContent = "Network error. Please try again.";
      msg.style.color = "var(--warn)";
    } finally {
      btn.disabled = false;
    }
  });
});
