import { describe, it, expect } from "vitest";
import { renderCollateralPdf } from "./collateral";

const SAMPLE = `# Taking Patient Vitals — Study Guide

A quick reference for the vitals module. Use it to **review the essentials** before the exam.

## Learning objectives

- Measure blood pressure, pulse, respiration, and temperature accurately
- Recognize values that fall outside the normal range
- Document each reading correctly in the patient chart

## Key terms

- **Systolic** — the pressure when the heart beats
- **Diastolic** — the pressure when the heart rests between beats

## Quick reference

| Vital | Normal range | Note |
| --- | --- | --- |
| Blood pressure | 90/60 – 120/80 | Cuff at heart level |
| Pulse | 60 – 100 bpm | Count a full 60 seconds |
| Respiration | 12 – 20 / min | Count without telling the patient |

## Red flags — stop and escalate

> **Escalate immediately** if systolic is over 180 or under 90, or if the patient reports chest pain. Do not proceed with therapy; notify the supervising chiropractor.

## Pre-visit checklist

- [ ] Clean and calibrate the equipment
- [ ] Confirm the patient has rested 5 minutes
- [ ] Select the correctly sized cuff

## Check your understanding

1. Why does cuff size affect a blood-pressure reading?
2. What is a normal resting pulse for an adult?
`;

describe("renderCollateralPdf", () => {
  it("produces a valid, non-trivial PDF", async () => {
    const bytes = await renderCollateralPdf({
      title: "Taking Patient Vitals — Study Guide",
      courseTitle: "Oregon CA — Initial Certification",
      typeLabel: "Study guide",
      markdown: SAMPLE,
      generatedDate: "Jun 25, 2026",
    });
    expect(bytes.length).toBeGreaterThan(2000);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
