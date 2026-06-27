import { describe, it, expect } from "vitest";
import { renderManualPdf } from "./collateral";

describe("renderManualPdf", () => {
  it("compiles multiple sections into one valid PDF", async () => {
    const bytes = await renderManualPdf({
      manualTitle: "Course — Training Manual",
      courseTitle: "Course",
      generatedDate: "Jun 27, 2026",
      sections: [
        { title: "Module 1", markdown: "# Old Title\n\n## Objectives\n- Do X (≥ 90%)" },
        { title: "Module 2", markdown: "# Other\n\n> **Red flag:** escalate." },
      ],
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(3000);
  });
});
