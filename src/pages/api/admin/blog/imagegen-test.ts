/**
 * Diagnostic: hit the configured image model with a trivial prompt and return
 * the RAW HTTP status + response body as plain text, so we can see exactly what
 * Google returns (key/billing/model errors, safety blocks, etc.). Never throws.
 * Admin-only (middleware). Visit /api/admin/blog/imagegen-test in the browser.
 */
import type { APIRoute } from "astro";
import { heroImageModel } from "@/lib/blog";

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env;
  const out: Record<string, unknown> = {
    GEMINI_API_KEY_set: !!env.GEMINI_API_KEY,
    GEMINI_IMAGE_MODEL: env.GEMINI_IMAGE_MODEL ?? "(unset → default)",
    model: heroImageModel(env),
  };

  if (!env.GEMINI_API_KEY) {
    out.note = "GEMINI_API_KEY is not set in this environment.";
    return new Response(JSON.stringify(out, null, 2), {
      headers: { "content-type": "application/json" },
    });
  }

  const model = heroImageModel(env);
  const base = "https://generativelanguage.googleapis.com/v1beta/models";
  const isImagen = model.startsWith("imagen");
  const url = isImagen ? `${base}/${model}:predict` : `${base}/${model}:generateContent`;
  const body = isImagen
    ? { instances: [{ prompt: "a simple flat illustration of a green leaf, cream background" }], parameters: { sampleCount: 1, aspectRatio: "16:9" } }
    : { contents: [{ role: "user", parts: [{ text: "a simple flat illustration of a green leaf, cream background" }] }], generationConfig: { responseModalities: ["IMAGE"] } };

  out.endpoint = url.replace(model, model); // shown for clarity
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    out.httpStatus = res.status;
    out.ok = res.ok;
    // Strip any huge base64 image payload so the preview is readable.
    out.responsePreview = text.replace(/"(data|bytesBase64Encoded)"\s*:\s*"[^"]+"/g, '"$1":"<base64 image omitted>"').slice(0, 1500);
  } catch (err) {
    out.fetchError = err instanceof Error ? err.message : String(err);
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { "content-type": "application/json" },
  });
};
