// src/index.ts
import { defaultGeoConfig as defaultGeoConfig2, defaultSeoConfig as defaultSeoConfig2 } from "@jeldon/config";

// src/geo.ts
import { defaultGeoConfig } from "@jeldon/config";
function calculateGeo(input, cfg = defaultGeoConfig) {
  const cleaned = input.body.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]+`/g, " ").replace(/!\[[^\]]*\]\([^)]+\)/g, " ").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_~>]/g, " ");
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  const checks = [];
  if (!wordCount) {
    return { score: 0, checks: [{ status: "bad", label: "GEO", value: "empty body" }], badCount: 1, mehCount: 0 };
  }
  let weightedSum = 0;
  let totalWeight = 0;
  for (const def of cfg.checks) {
    const { metric, display } = evaluate(def, cleaned, input.body, wordCount);
    const [good, meh] = def.thresholds;
    const status = metric >= good ? "good" : metric >= meh ? "meh" : "bad";
    checks.push({ status, label: def.label, value: display });
    const w = def.weight;
    weightedSum += (status === "good" ? 1 : status === "meh" ? 0.5 : 0) * w;
    totalWeight += w;
  }
  const score = totalWeight > 0 ? Math.round(weightedSum / totalWeight * 100) : 0;
  return {
    score,
    checks,
    badCount: checks.filter((c) => c.status === "bad").length,
    mehCount: checks.filter((c) => c.status === "meh").length
  };
}
function evaluate(def, cleaned, body, wordCount) {
  if (def.kind === "questionH2") {
    const h2s = body.match(/^##\s+(.+)$/gm) || [];
    const starters = (def.patterns ?? []).map((s) => s.toLowerCase());
    const startersRe = starters.length ? new RegExp(`^(${starters.join("|")})\\b`, "i") : null;
    const count = h2s.filter((h) => {
      const text = h.replace(/^##\s+/, "").trim();
      return /\?\s*$/.test(text) || (startersRe ? startersRe.test(text) : false);
    }).length;
    return { metric: count, display: String(count) };
  }
  const target = def.target === "body" ? body : cleaned;
  const re = new RegExp((def.patterns ?? []).join("|"), def.flags ?? "g");
  const matches = target.match(re) || [];
  if (def.kind === "regexPer1k") {
    const density = matches.length / wordCount * 1e3;
    return { metric: density, display: `${density.toFixed(1)}/1k words` };
  }
  return { metric: matches.length, display: String(matches.length) };
}

// src/seo.ts
import { defaultSeoConfig } from "@jeldon/config";

// src/reading-level.ts
function fleschKincaidGrade(text) {
  const cleaned = text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]+`/g, " ").replace(/!\[[^\]]*\]\([^)]+\)/g, " ").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/^#{1,6}\s+/gm, "").replace(/[*_~>]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const sentences = cleaned.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().length > 0).length;
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (!sentences || !words.length) return null;
  let syllables = 0;
  for (const raw of words) syllables += countSyllables(raw);
  const grade = 0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59;
  return Math.round(grade * 10) / 10;
}
function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

// src/seo.ts
function calculateSeo(input, cfg = defaultSeoConfig) {
  const { title, excerpt, tags, body, slug, heroImage, heroImageAlt } = input;
  const wordCount = body.replace(/```[\s\S]*?```/g, "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;
  const h2Count = (body.match(/^##\s+/gm) || []).length;
  const links = body.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [];
  const internalLinkRe = new RegExp(`\\]\\(\\/(${cfg.internalLinkPrefixes.join("|")})`);
  const internalLinks = links.filter((l) => internalLinkRe.test(l)).length;
  const externalLinks = links.length - internalLinks;
  const images = body.match(/!\[([^\]]*)\]\(([^)]+)\)/g) || [];
  const imagesNoAlt = images.filter((img) => /^!\[\s*\]/.test(img)).length;
  const checks = [];
  const push = (status, label, value) => checks.push({ status, label, value });
  const within = (n, [lo, hi]) => n >= lo && n <= hi;
  const tl = title.length;
  push(within(tl, cfg.title.good) ? "good" : tl > 0 && tl <= cfg.title.mehMax ? "meh" : "bad", "Title length", `${tl} chars`);
  const el = excerpt.length;
  push(within(el, cfg.excerpt.good) ? "good" : within(el, cfg.excerpt.meh) ? "meh" : "bad", "Excerpt length", `${el} chars`);
  const sl = slug.length;
  const slugClean = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
  push(slugClean && sl <= cfg.slugMaxLen ? "good" : slugClean ? "meh" : "bad", "Slug", `${sl} chars`);
  push(within(wordCount, cfg.wordCount.good) ? "good" : wordCount >= cfg.wordCount.mehMin ? "meh" : "bad", "Word count", String(wordCount));
  const bodyChars = body.length;
  push(bodyChars <= cfg.bodyChars.good ? "good" : bodyChars <= cfg.bodyChars.meh ? "meh" : "bad", "Body chars (TTS)", `${bodyChars}`);
  push(within(h2Count, cfg.h2.good) ? "good" : within(h2Count, cfg.h2.meh) ? "meh" : "bad", "H2 sections", String(h2Count));
  push(internalLinks >= cfg.internalLinks.good ? "good" : internalLinks >= cfg.internalLinks.meh ? "meh" : "bad", "Internal links", String(internalLinks));
  push("good", "External links", String(externalLinks));
  push(within(tags.length, cfg.tags.good) ? "good" : tags.length >= cfg.tags.mehMin ? "meh" : "bad", "Tags", String(tags.length));
  if (images.length > 0) {
    push(imagesNoAlt === 0 ? "good" : "bad", "Images w/o alt", `${imagesNoAlt} of ${images.length}`);
  }
  push(heroImage ? "good" : "bad", "Hero image", heroImage ? "set" : "missing");
  if (heroImage) {
    const alt = (heroImageAlt ?? "").trim();
    const altWords = alt.split(/\s+/).filter(Boolean).length;
    push(within(altWords, cfg.heroAltWords.good) ? "good" : altWords > 0 ? "meh" : "bad", "Hero alt text", altWords > 0 ? `${altWords} words` : "missing");
  }
  const badFilenameRe = new RegExp(cfg.badFilenameRe, "i");
  const allImagePaths = [];
  if (heroImage) allImagePaths.push(heroImage);
  for (const img of images) {
    const m = img.match(/!\[[^\]]*\]\(([^)\s]+)/);
    if (m && m[1]) allImagePaths.push(m[1]);
  }
  if (allImagePaths.length > 0) {
    const badNames = allImagePaths.filter((p) => {
      const file = p.split("/").pop() || "";
      const base = file.replace(/\.[^.]+$/, "");
      return badFilenameRe.test(base) || base.includes(" ") || base.length < 4;
    }).length;
    push(badNames === 0 ? "good" : "bad", "Image filenames", badNames === 0 ? "descriptive" : `${badNames} unhelpful`);
  }
  const slugWords = slug.split("-").filter((w) => w.length > 3);
  const titleLower = title.toLowerCase();
  const titleHasSlugWord = slugWords.some((w) => titleLower.includes(w));
  push(titleHasSlugWord ? "good" : "meh", "Slug words in title", titleHasSlugWord ? "yes" : "no");
  const fkgl = fleschKincaidGrade(body);
  if (fkgl != null) {
    const status = within(fkgl, cfg.reading.good) ? "good" : fkgl <= cfg.reading.mehMax ? "meh" : "bad";
    push(status, "Reading level", `grade ${fkgl}`);
  }
  const triggerRe = new RegExp(`\\b(${cfg.evidenceTriggers.map(escapeRe).join("|")})\\b`, "gi");
  const evidenceTriggers = body.match(triggerRe);
  if (evidenceTriggers && evidenceTriggers.length > 0) {
    const refRe = new RegExp(`^##\\s+(${cfg.referenceSectionNames.map(escapeRe).join("|")})\\b[\\s\\S]*`, "im");
    const refMatch = body.match(refRe);
    const refBlock = refMatch ? refMatch[0] : "";
    const refLinks = (refBlock.match(/\]\(https?:\/\/[^)]+\)/g) || []).length;
    let status = "bad";
    let value = "missing";
    if (!refBlock) {
      value = `${evidenceTriggers.length} claim(s), no references`;
    } else if (refLinks === 0) {
      value = "references section has no links";
    } else if (refLinks < 2 && evidenceTriggers.length >= 3) {
      status = "meh";
      value = `${refLinks} ref(s) for ${evidenceTriggers.length} claim(s)`;
    } else {
      status = "good";
      value = `${refLinks} ref(s)`;
    }
    push(status, "Citations", value);
  }
  const score = Math.round(
    checks.reduce((s, c) => s + (c.status === "good" ? 1 : c.status === "meh" ? 0.5 : 0), 0) / checks.length * 100
  );
  return {
    score,
    checks,
    badCount: checks.filter((c) => c.status === "bad").length,
    mehCount: checks.filter((c) => c.status === "meh").length
  };
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/index.ts
function scoreArticle(input, scoring) {
  return {
    seo: calculateSeo(input, scoring?.seo ?? defaultSeoConfig2),
    geo: calculateGeo(input, scoring?.geo ?? defaultGeoConfig2)
  };
}
export {
  calculateGeo,
  calculateSeo,
  fleschKincaidGrade,
  scoreArticle
};
