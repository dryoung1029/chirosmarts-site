/**
 * Marketing copy registry. Now populated with owner-supplied copy. Anything the
 * owner still flagged `[VERIFY ...]` (regulatory facts, fees, approval language)
 * is kept VERBATIM and visible — it must be certified by the owner before the
 * site truly launches (PLAN.md lists every one). We never author or resolve a
 * [VERIFY] claim ourselves. Items still `null` render a `[OWNER COPY: …]` chip.
 */
export function ownerCopy(desc: string): string {
  return `[OWNER COPY: ${desc}]`;
}

export const OWNER = {
  hero: {
    headline: "Become a certified Oregon CA — without the guesswork.",
    subhead:
      "The state-required training, your hands-on log, exam prep, and a verifiable certificate — every step in one place, with your renewal tracked automatically every year after. Built by an Oregon chiropractor who's been training CAs for over a decade. Module 1 is free — start tonight.",
    demoCaption:
      "A real student dashboard — from first login to certified, and every renewal after.",
  },
  // Owner-supplied stats included [VERIFY] numbers (CA count, year). Per the
  // owner's own note ("only real numbers can ship"), stats stay EMPTY until the
  // confirmed figures are provided — the bar renders nothing rather than a flag.
  stats: [] as { value: string; label: string }[],
  instructor: {
    name: "Jason Young, DC",
    credentials:
      "Chiropractic physician · Former president, Oregon Board of Chiropractic Examiners",
    bio: "Dr. Young has practiced in Corvallis, Oregon since 2008 and has trained Oregon chiropractic assistants for more than a decade. He holds a bachelor's degree in human biology and a master's in nutrition, served as an at-large director of the National Board of Chiropractic Examiners, and runs Body of Health Chiropractic & Wellness Center. He built ChiroSmarts to be the resource he wanted for his own staff: training that's actually clear about what Oregon requires, with nothing left to guess.",
    photo: "/instructor/jason-young.jpg" as string | null,
  },
  homepageFaq: [
    {
      q: "Do I need this training before I can work in a chiropractic office?",
      a: "You can be hired first — most CAs are. But Oregon requires certification before you perform clinical duties like therapies, so most clinics want you certified quickly. Our students typically finish the online training within a week of starting.",
    },
    {
      q: "Is this the official Oregon certification?",
      a: "ChiroSmarts provides the state-required training and tracks your completion. Certification itself is issued by the Oregon Board of Chiropractic Examiners after you complete training, apply, and pass the state's certification exam — and your roadmap walks you through every one of those steps.",
    },
    {
      q: "How long does the training take?",
      a: "The online portion is 8 hours of instruction. Watch it in two evenings or two weeks — your progress saves automatically, and your hours are tracked as you go. The 4 hands-on hours happen at your clinic with your supervising doctor, using the prep materials and signable log we provide.",
    },
    {
      q: "How much does it cost?",
      a: "Initial certification training is $149, and Module 1 is free before you pay anything. Renewal courses run $29–89. Your state certification fee is paid separately to the Oregon Board of Chiropractic Examiners — currently $175 for initial certification (which includes your background check). See the OBCE Chiropractic Assistant page (oregon.gov/obce) for current fees and to apply.",
    },
    {
      q: "What if it's not for me?",
      a: "Full refund within 14 days, as long as you haven't passed the final exam or been issued a certificate. And Module 1 is free, so you'll know what you're buying before you spend a dollar.",
    },
    {
      q: "I was certified years ago through ChiroSmarts. Do you still have my records?",
      a: "Every ChiroSmarts certificate carries a verification code that stays valid. You, an employer, or the board can confirm a past certification anytime on our public certificate verification page — just visit /verify and enter the code.",
    },
    {
      q: "Who's behind this?",
      a: "Dr. Jason Young — an Oregon chiropractor in active practice who has trained Oregon CAs for over a decade and previously served as an at-large director of the National Board of Chiropractic Examiners. You're learning the requirements from someone who has worked on both sides of them.",
    },
  ] as { q: string; a: string }[],
  clinics: {
    headline: "Every CA certified. Every renewal on time. Nothing on your plate.",
    subhead:
      "Buy training seats, invite your staff by email, and see your whole team's certification status on one screen — initial training, renewal deadlines, and certificates, tracked for you. Built by a practicing Oregon DC who got tired of chasing renewal paperwork in his own clinic.",
    seatsClosingLine:
      "New hire? One seat, one email, and they're training the same day — with their hours, exam, and certificate documented to audit standard. Their records stay attached to their name, and your dashboard always shows you who's current.",
    videoIntro:
      "See it in 90 seconds. Dr. Young walks through buying seats, inviting a new CA, and the compliance view your front office will actually use.",
    demoVideoStreamUid: null as string | null,
  },
  about:
    "I'm Dr. Jason Young, and I've practiced chiropractic in Corvallis, Oregon since 2008. ChiroSmarts grew out of a problem I kept running into in my own clinic: a new chiropractic assistant needed to be trained and certified quickly, but the only options were waiting months for an opening in a classroom course or traveling across the state for an entire weekend. Getting a CA properly trained in Oregon was harder, and slower, than it needed to be.\n\nI was the first chiropractor in Oregon to offer online chiropractic assistant training. At the time the state's rules didn't account for online instruction, so I went to the Oregon Board of Chiropractic Examiners (OBCE) and made the case for allowing it. Later I served on that board from 2013 to 2019 — including two terms as its president — and helped shape the rules that govern CA practice in Oregon today. I've also served as an at-large director of the National Board of Chiropractic Examiners.\n\nThat's the perspective behind this platform: I've trained Oregon CAs for over a decade, and I've sat on the regulatory side of the table. ChiroSmarts is the resource I wanted for my own staff — training that's clear about exactly what Oregon requires, with the hours, exam, certificate, and yearly renewals all tracked to audit standard, so nothing is left to guess." as
      | string
      | null,
} as const;

export const COURSE_MARKETING: Record<
  string,
  {
    requirements?: { requires: string; provides: string }[];
    requirementsVerify?: string;
    faqs?: { q: string; a: string }[];
  }
> = {
  "oregon-ca-initial": {
    requirements: [
      {
        requires: "8 hours of didactic (classroom-style) training",
        provides:
          "The full 8 hours, online and self-paced, with your completion time tracked automatically and recorded for audit",
      },
      {
        requires: "4 hands-on hours with your supervising chiropractor",
        provides:
          "A prep packet and demonstration videos sent to your doctor, plus the signable training log — so the in-clinic session is organized and documented correctly",
      },
      {
        requires:
          "Application to the Oregon Board of Chiropractic Examiners, including fingerprinting",
        provides:
          "A step-by-step guided checklist on your dashboard, with your ChiroSmarts documents ready to submit",
      },
      {
        requires: "Passing the state certification exam",
        provides:
          "A practice question bank mapped to the exam topics, plus an AI study companion that answers from the course itself",
      },
      {
        requires: "BLS/CPR within your first certified year",
        provides: "A tracked deadline with reminders, right on your dashboard",
      },
      {
        requires: "6 hours of continuing education every year after",
        provides:
          "Your renewal date tracked automatically by birth month, with reminder emails and a one-click renewal bundle",
      },
    ],
    faqs: [
      {
        q: "Is this course accepted by the Oregon board?",
        a: "Yes. This course is provided by Dr. Jason Young, an authorized trainer for the OBCE chiropractic-assistant initial training, and it meets Oregon's 8-hour didactic requirement. It has been used by Oregon CAs for over a decade.",
      },
      {
        q: "Can I really try it free?",
        a: "Yes — all of Module 1, including its knowledge check, before any payment. If it's not for you, walk away; we'll save your progress in case you come back.",
      },
      {
        q: "Do I have to finish in one sitting?",
        a: "No. Progress saves automatically across devices — laptop tonight, phone at lunch tomorrow. Your tracked hours pick up exactly where you stopped.",
      },
      {
        q: "What's the final exam like?",
        a: "Multiple choice, based directly on the course, with an 80% passing score. Miss it and you can review and retake — your dashboard shows you which sections to revisit. Note: this is the course exam, not the state's certification exam; we help you prepare for that separately.",
      },
      {
        q: "What about the 4 hands-on hours?",
        a: "Those happen at your clinic with your supervising chiropractor. When you add your doctor during signup, we send them a prep packet covering exactly what the session must include, and you get the signable log for your records and your board application.",
      },
      {
        q: "When do I get my certificate?",
        a: "The moment you pass the final exam. It's emailed to you as a PDF, stored permanently in your account, and carries a verification code any employer or the board can check on our public verification page.",
      },
      {
        q: "My clinic is paying — how does that work?",
        a: "Ask your doctor or office manager to create a clinic account, buy a seat, and invite you by email. You claim the seat and the course is yours — your certificate and records belong to you, even if you change clinics later.",
      },
    ],
  },
};
