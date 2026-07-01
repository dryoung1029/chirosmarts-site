# Re-permission + birth-month-capture emails (Brevo)

Ready-to-paste copy for reactivating the imported legacy list. Text-forward,
personal, single clear CTA — built to maximize response on an aging list while
protecting sender reputation. Send from **Brevo** (marketing), not Resend.

## Ground rules (don't skip)

- **From name:** `Dr. Jason Young, ChiroSmarts` — a person, not a brand/noreply.
- **From address:** something on your verified domain, e.g. `hello@chirosmarts.com`.
- **Reply-to:** a real, monitored inbox (`contact@chirosmarts.com`). Replies = trust + deliverability.
- **One CTA only:** set your renewal month. Every link points to the same place.
- **Merge fields (Brevo syntax):** `{{ contact.FIRSTNAME }}` and `{{ contact.RENEWAL_URL }}`.
  Map the CSV's **Renewal setup URL** column to a Brevo attribute named `RENEWAL_URL`
  when you import.
- **Send order (warm-up):** Past buyers first → then Certified / Need-month → then
  colder prospects. Small batches, Tue–Thu ~10am Pacific. Watch bounces/opens before widening.
- **You get two touches, not one:** the primary send, then ONE reminder to non-openers
  (~4 days later, new subject). That reminder typically adds 30–50% more responses and is
  safe. After that, suppress non-responders — that's what protects your reputation.

---

## EMAIL 1 — Primary (Certified / Past buyers / Need renewal month)

**Subject A (recommended):** `{{ contact.FIRSTNAME }}, when's your CA renewal due?`
**Subject B (A/B alt):** `Never scramble for your CA renewal again`
**Subject C (A/B alt):** `A 10-second fix for your Oregon CA renewal`

**Preheader:** `Tell me your birth month and I'll remind you before every deadline — plus the fastest way to get your hours.`

**Body:**

> Hi {{ contact.FIRSTNAME }},
>
> It's Dr. Jason Young from ChiroSmarts — you earned your Oregon Chiropractic Assistant certification with us, and I wanted to make your life a little easier.
>
> Oregon CAs have to renew **every year in their birth month**, with 6 CE hours (including vitals and cultural competency). It's easy to lose track of — and a lapsed certification is exactly the kind of headache you don't need.
>
> So here's a simple fix: **tell me your birth month, and I'll send you a heads-up before each deadline** — plus the fastest way to knock out your hours in one sitting. No more scrambling, no more guessing.
>
> **[ Set my renewal reminders → ]**  ← button links to `{{ contact.RENEWAL_URL }}`
>
> It takes about 10 seconds. I only email a few times a year — always about your renewal or something genuinely useful for Oregon CAs — and you can unsubscribe anytime.
>
> Thanks for being part of ChiroSmarts.
>
> — Dr. Jason Young, DC
> ChiroSmarts
>
> P.S. Want it off your plate for the year? [Set your reminder here]({{ contact.RENEWAL_URL }}) and you're done.

---

## EMAIL 2 — Reminder to non-openers (send ~4 days later, ONLY to people who didn't open #1)

**Subject A:** `Still worth 10 seconds, {{ contact.FIRSTNAME }}`
**Subject B (alt):** `Quick nudge — your CA renewal date`

**Preheader:** `One tap and I'll make sure your Oregon CA renewal never sneaks up on you.`

**Body:**

> Hi {{ contact.FIRSTNAME }},
>
> Quick follow-up — I don't want your Oregon CA renewal to catch you off guard.
>
> If you tell me your birth month, I'll remind you before your deadline each year and hand you the fastest way to get your 6 CE hours. That's the whole thing.
>
> **[ Set my renewal reminders → ]**  ← links to `{{ contact.RENEWAL_URL }}`
>
> Ten seconds and you're set. Not interested? No worries — you can unsubscribe below and I won't email again.
>
> — Dr. Jason Young, DC
> ChiroSmarts

---

## EMAIL 3 — Prospect win-back (free-CEU signups who never certified)

Different audience, different CTA — nudge them toward the initial certification.
Use the **Prospects** segment CSV. No RENEWAL_URL needed; link to the course.

**Subject A:** `Ready to make your Oregon CA cert official?`
**Subject B (alt):** `You started — here's the finish line`

**Preheader:** `The complete Oregon CA certification, online, at your pace.`

**Body:**

> Hi {{ contact.FIRSTNAME }},
>
> A while back you grabbed some free CE from ChiroSmarts — thanks for that. If you're working (or hoping to work) at the front of a chiropractic office in Oregon, the next step is getting **fully certified**.
>
> Our online **Oregon CA Certification** covers the state-required training end to end — the didactic hours, a final exam, and an instantly verifiable certificate — all at your own pace, with automatic hour tracking so it's audit-ready.
>
> **[ See the certification course → ]**  ← links to `https://chirosmarts.com/courses/oregon-ca-initial`
>
> Questions about whether you need it? Just reply — I read these.
>
> — Dr. Jason Young, DC
> ChiroSmarts

---

## Brevo setup checklist

1. **Import** the segment CSV (Admin → Contacts → the segment's *Export CSV*).
2. On import, **map columns**: Email → email, First name → `FIRSTNAME`, Renewal setup URL → a
   new/`RENEWAL_URL` attribute (Text).
3. Build the message with the copy above; insert merge fields from the personalization menu.
4. Set From name / From address / Reply-to as in Ground Rules.
5. **A/B the subject** (Certified and Past-buyer segments are big enough — test on ~20%, auto-send the winner).
6. Send batch 1 (Past buyers). After ~2 days, check opens/bounces/complaints, then send the next segment.
7. Create a **"did not open" segment** from send #1 and send Email 2 to it ~4 days later.
8. Anyone who clicks and sets their month is auto-added as a confirmed contact **and** flows into the
   precise renewal reminders on our side — no further action needed.
