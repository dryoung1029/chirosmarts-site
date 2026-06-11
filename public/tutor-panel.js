/**
 * Course tutor chat widget (M6). Initializes every [data-tutor-panel] on the
 * page: posts questions to /api/tutor and renders the grounded answer plus
 * deep-linked citations. Shared by the course tutor page and the per-lesson
 * sidebar — both pass the course slug via data-course-slug.
 */
function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function initPanel(root) {
  const slug = root.getAttribute("data-course-slug");
  const thread = root.querySelector("[data-tutor-thread]");
  const input = root.querySelector("[data-tutor-input]");
  const send = root.querySelector("[data-tutor-send]");
  if (!slug || !thread || !input || !send) return;

  function bubble(role, html) {
    const el = document.createElement("div");
    el.className = "tutor-msg tutor-" + role;
    el.innerHTML = html;
    thread.appendChild(el);
    thread.scrollTop = thread.scrollHeight;
    return el;
  }

  async function ask() {
    const question = input.value.trim();
    if (!question) return;
    input.value = "";
    send.disabled = true;
    input.disabled = true;
    bubble("user", esc(question));
    const pending = bubble("bot", '<span class="muted">Thinking…</span>');

    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseSlug: slug, question }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        pending.innerHTML =
          '<span style="color:var(--warn)">' +
          esc(data.error || "Something went wrong. Please try again.") +
          "</span>";
      } else {
        let html = esc(data.answer || "").replace(/\n/g, "<br>");
        if (Array.isArray(data.citations) && data.citations.length) {
          html +=
            '<div class="tutor-cites"><strong>Sources</strong><ul>' +
            data.citations
              .map(
                (c) =>
                  '<li>[' +
                  c.n +
                  '] <a href="' +
                  esc(c.href) +
                  '">' +
                  esc(c.lessonTitle) +
                  " @ " +
                  esc(c.timestamp) +
                  "</a></li>",
              )
              .join("") +
            "</ul></div>";
        }
        pending.innerHTML = html;
      }
    } catch {
      pending.innerHTML =
        '<span style="color:var(--warn)">Network error. Please try again.</span>';
    } finally {
      send.disabled = false;
      input.disabled = false;
      input.focus();
    }
  }

  send.addEventListener("click", ask);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask();
    }
  });
}

document.querySelectorAll("[data-tutor-panel]").forEach(initPanel);
