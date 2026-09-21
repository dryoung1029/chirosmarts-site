/**
 * Official Oregon Board of Chiropractic Examiners (OBCE) links.
 *
 * These are the Board's own documents/pages — the authority for everything the
 * platform does NOT verify itself (supervised hands-on hours, the application,
 * fingerprinting, the state exam). Kept in one place so a Board URL change is a
 * one-line edit rather than a hunt through pages and emails.
 */
export const OBCE = {
  /** The Board's main site. */
  home: "https://www.oregon.gov/obce",

  /**
   * CA Initial Training Guidelines + Training Log (PDF). This is the form the
   * student takes to their clinic: the supervising DC signs off the 4 hours of
   * supervised hands-on training, and it's submitted with the application.
   * Owner-supplied 2026-08.
   */
  trainingLog:
    "https://www.oregon.gov/obce/Documents/Archive/Archived%20Docs/Licensing/CA%20Initial%20Training%20Guidelines%20and%20Training%20Log.pdf",
} as const;
