-- One-time seed: first blog article (draft). Idempotent (INSERT OR IGNORE).
-- Run locally:  npx wrangler d1 execute chirosmarts --local  --file=scripts/seed-first-article.sql
-- Run on prod:  npx wrangler d1 execute chirosmarts --remote --file=scripts/seed-first-article.sql

INSERT OR IGNORE INTO blog_posts (id, slug, title, excerpt, body_markdown, author, author_credentials, tags, status, seo_description, model, created_at, updated_at)
VALUES ('post_how_to_become_ca_oregon', 'how-to-become-a-chiropractic-assistant-in-oregon', 'How to Become a Chiropractic Assistant in Oregon', 'To become a chiropractic assistant (CA) in Oregon, you must complete board-approved CA training, then apply to the Oregon Board of Chiropractic Examiners (OBCE) for certification before you can perfor', '# How to Become a Chiropractic Assistant in Oregon

**To become a chiropractic assistant (CA) in Oregon, you must complete board-approved CA training, then apply to the Oregon Board of Chiropractic Examiners (OBCE) for certification before you can perform clinical duties like therapies. Most people are hired by a clinic first and get certified shortly after — the training itself can be finished in about a week.**

If you''ve just been hired at a chiropractic office, or you''re thinking about it, the path is more straightforward than it looks. I''m Dr. Jason Young — I''ve practiced in Oregon since 2008, trained CAs for over a decade, and served as president of the OBCE — and this is the same roadmap I walk my own staff through.

## Key takeaways

- A chiropractic assistant in Oregon must be **certified by the OBCE** before performing clinical duties.
- Certification requires **board-approved training** (didactic instruction plus supervised hands-on practice), an application, and a passing exam score.
- You can usually be **hired first** and complete certification quickly afterward.
- The online training portion can be done **from any device, on your schedule** — you no longer have to wait months for a class or travel across the state for a weekend course.
- Your clinic''s supervising doctor signs off on the hands-on portion.

## What does a chiropractic assistant do?

A chiropractic assistant supports the doctor and keeps the clinic running. Depending on the office, a CA may room patients, take vitals, set up and apply therapies (such as electrical stimulation, ultrasound, or traction) under the doctor''s direction, manage the front desk, and handle scheduling and records.

The key distinction in Oregon is between front-office work and **clinical duties**. Answering phones and scheduling doesn''t require certification — but the moment you start applying therapies or performing clinical tasks, you need to be a certified CA. That''s why most clinics want new hires certified quickly.

## What are the requirements to become a certified CA in Oregon?

Certification in Oregon is issued by the **[Oregon Board of Chiropractic Examiners](https://www.oregon.gov/obce)**, not by any single training provider. In broad strokes, you''ll need to:

1. Complete **board-approved CA training**, which includes didactic (classroom-style) instruction plus supervised hands-on hours at a clinic.
2. **Pass the required exam** at the board''s passing threshold.
3. Submit your **application and fee** to the OBCE, including any required background check.

The exact number of training hours, the fee amounts, and the background-check details are set by the board and can change. [VERIFY] Confirm the current requirements and fees directly on the [OBCE Chiropractic Assistant page](https://www.oregon.gov/obce) before you apply — that''s always the authoritative source.

## How long does the training take?

The didactic portion of ChiroSmarts training is **8 hours of instruction**, and the supervised hands-on portion happens at your clinic with your doctor. Because the online instruction is self-paced, most students finish within a week of starting — some knock it out over two evenings.

This is the part that''s changed the most. When I started, the only options were waiting months for an opening in a classroom course or giving up an entire weekend to travel across the state. Today you can complete the instruction from a computer, phone, or tablet, wherever you are. You can [see the certification course here](/courses).

## How much does it cost?

There are two separate costs to plan for:

- **Training** — ChiroSmarts initial certification training is **$149**, and the first module is free, so you can start before paying anything.
- **State certification fee** — paid separately to the OBCE when you apply. [VERIFY] Check the current amount on the [OBCE website](https://www.oregon.gov/obce); board fees are set by the state and can change.

After your first year, you''ll also have **annual continuing education** to keep your certification current. We track that for you and send reminders — you can read more on our [renewal page](/renewal).

## Step-by-step: getting certified

1. **Get hired (or line up a clinic).** You need a supervising doctor to complete the hands-on portion, so this usually comes first.
2. **Start the online training.** With ChiroSmarts, Module 1 is free — begin the same day.
3. **Finish the didactic hours and pass the exam.** Your progress saves automatically as you go.
4. **Complete the supervised hands-on hours** at your clinic with your doctor.
5. **Apply to the OBCE** with your documentation and fee.
6. **Keep your certification current** with annual CE each year after.

## Frequently asked questions

### Do I need to be certified before I can work in a chiropractic office?

Not to be hired — most CAs are hired first. But Oregon requires certification before you perform clinical duties like applying therapies, so clinics typically want you certified quickly. The training can be completed in about a week.

### Is ChiroSmarts the official Oregon certification?

ChiroSmarts provides the board-approved training and tracks your completion. Certification itself is issued by the OBCE after you complete training, apply, and pass the exam. Our roadmap walks you through each of those steps.

### Can I do the training from home?

Yes. The didactic instruction is fully online and works on a computer, phone, or tablet, on your own schedule. Only the hands-on portion happens in person, at your clinic with your supervising doctor.

### How do I verify a certificate I already earned?

Every ChiroSmarts certificate carries a verification code that stays valid. You, an employer, or the board can confirm a certification anytime on our [certificate verification page](/verify).

### Where do I confirm the official requirements and fees?

Always the [Oregon Board of Chiropractic Examiners](https://www.oregon.gov/obce). Training providers can teach the material, but the board sets the rules, fees, and certification — so confirm specifics there before applying.

## Bottom line

Becoming a chiropractic assistant in Oregon comes down to three things: complete board-approved training, pass the exam, and get certified by the OBCE before you take on clinical duties. The training no longer has to be slow or inconvenient — you can start online today, finish in about a week, and let your clinic handle the hands-on sign-off.

If you''re ready to begin, [Module 1 of our certification course is free](/courses) — and if you''re a clinic owner certifying your whole team, [here''s how ChiroSmarts works for clinics](/clinics). Want to know who''s behind the training? [Here''s my story](/about).
', 'Jason Young, DC', 'Former president, Oregon Board of Chiropractic Examiners', '["Getting started","Oregon CA","Certification"]', 'draft', 'To become a chiropractic assistant (CA) in Oregon, you must complete board-approved CA training, then apply to the Oregon Board of Chiropractic Examiners (OBCE)', 'hand-authored', '2026-06-29T00:00:00.000Z', '2026-06-29T00:00:00.000Z');
