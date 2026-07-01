/**
 * Lead-magnet content: the "Oregon CA Certification Checklist" delivered to
 * confirmed checklist leads. Rendered to a branded PDF on the fly via
 * renderCollateralPdf (no manual R2 upload to forget). The regulatory facts
 * here mirror the owner-approved copy already live in the homepage/course FAQs
 * (8 didactic hours, 4 hands-on, OBCE application + fingerprinting, state exam,
 * BLS/CPR in year one, 6 CE hours/yr). Anything the board controls is flagged
 * "verify current requirements at oregon.gov/obce" — we never assert a fee or
 * rule as final.
 */
import { renderCollateralPdf } from "@/lib/pdf/collateral";

/** Build the checklist Markdown. `site` is the bare origin (no trailing slash). */
export function buildChecklistMarkdown(site: string): string {
  const s = site.replace(/\/$/, "");
  return `# Oregon Chiropractic Assistant Certification Checklist

Everything it takes to go from "just hired" to a certified Oregon Chiropractic
Assistant — in order, with nothing left to guess. Print this, tick the boxes as
you go, and you'll always know exactly where you stand.

**New to this?** Module 1 of our training is completely free — you can start
tonight at ${s}/courses.

---

## Step 1 — Get set up

- [ ] Confirm you're working under (or hired by) an Oregon-licensed chiropractor
- [ ] Create your ChiroSmarts account and complete the short intake
- [ ] Add your supervising doctor so we can send their hands-on prep packet

## Step 2 — Complete the required training

Oregon requires **8 hours of didactic (classroom-style) training** plus
**4 hands-on hours** with your supervising chiropractor.

- [ ] Finish the 8-hour online course (self-paced — most students finish in a couple of evenings)
- [ ] Pass the course knowledge checks and final exam (80% to pass; retakes allowed)
- [ ] Complete your 4 hands-on hours with your supervising DC
- [ ] Get the hands-on training log signed and save your copy

## Step 3 — Apply to the Oregon Board (OBCE)

- [ ] Submit your Chiropractic Assistant application to the Oregon Board of Chiropractic Examiners
- [ ] Complete fingerprinting / background check
- [ ] Pay the state certification fee (currently **$175**, which includes the background check — *verify current fees at oregon.gov/obce*)

## Step 4 — Pass the state certification exam

- [ ] Review using your practice question bank and AI study companion
- [ ] Pass the OBCE certification exam
- [ ] Receive your state CA certification

## Step 5 — Finish your first-year requirement

- [ ] Complete **BLS/CPR certification** within your first certified year

## Step 6 — Keep it current, every year

- [ ] Complete **6 hours of continuing education** each year
- [ ] Renew on time — Oregon renewals track by your **birth month**
- [ ] Let ChiroSmarts track your renewal date and remind you automatically

---

## You don't have to do this alone

ChiroSmarts walks you through every step above — your hours, exam, certificate,
and yearly renewals, all tracked to audit standard.

- **Start the free Module 1:** ${s}/courses
- **Read our Oregon CA guides & blog:** ${s}/blog
- **For clinics — certify your whole team:** ${s}/clinics
- **Verify any ChiroSmarts certificate:** ${s}/verify

Questions? Email contact@chirosmarts.com — a real Oregon chiropractor reads it.

*This checklist is a general guide, not legal or regulatory advice. The Oregon
Board of Chiropractic Examiners sets the official requirements and fees; always
confirm the current rules at oregon.gov/obce before you apply.*`;
}

/** Render the checklist lead magnet to a branded PDF. */
export async function renderChecklistPdf(site: string, generatedDate: string): Promise<Uint8Array> {
  return renderCollateralPdf({
    title: "Oregon CA Certification Checklist",
    courseTitle: "ChiroSmarts",
    typeLabel: "Free guide",
    markdown: buildChecklistMarkdown(site),
    generatedDate,
    skipFirstH1: true,
  });
}
