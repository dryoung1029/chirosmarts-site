// src/frontmatter.ts
function unescapeStr(s) {
  return s.replace(/\\(.)/g, (_, c) => c === "n" ? "\n" : c);
}
function escapeStr(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "").replace(/\n/g, "\\n");
}
function unquote(v) {
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
    return unescapeStr(v.slice(1, -1));
  }
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) {
    return v.slice(1, -1);
  }
  return v;
}
function parseValue(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((s) => unquote(s.trim()));
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  const unq = unquote(v);
  if (/^-?[1-9]\d*(\.\d+)?$/.test(unq) || unq === "0") return Number(unq);
  return unq;
}
function formatValue(v) {
  if (typeof v === "boolean") return String(v);
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return `[${v.map((s) => `"${escapeStr(String(s))}"`).join(", ")}]`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (/^[a-z]+$/.test(v) && v.length < 20) return v;
  return `"${escapeStr(v)}"`;
}
var defaultFrontmatterCodec = {
  parse(raw) {
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) return { frontmatter: {}, body: raw };
    const [, fmRaw, body] = match;
    const fm = {};
    for (const line of (fmRaw ?? "").split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      const valRaw = m[2];
      fm[key] = parseValue(valRaw.trim());
    }
    return { frontmatter: fm, body: body ?? "" };
  },
  serialize({ frontmatter, body }) {
    const lines = ["---"];
    for (const [key, val] of Object.entries(frontmatter)) {
      lines.push(`${key}: ${formatValue(val)}`);
    }
    lines.push("---", "");
    return lines.join("\n") + body.replace(/^\n+/, "");
  }
};

// src/env.ts
function resolveEnvBag(locals) {
  return locals?.runtime?.env ?? (typeof process !== "undefined" ? process.env : {});
}
function readGitHubEnv(locals) {
  const env = resolveEnvBag(locals);
  const token = env.GITHUB_TOKEN;
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH;
  if (!token || !owner || !repo || !branch) {
    throw new Error(
      "Missing GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO / GITHUB_BRANCH env vars"
    );
  }
  return { token, owner, repo, branch };
}

// src/github-store.ts
var DEFAULT_CONTENT_DIR = "src/content/articles";
var DEFAULT_USER_AGENT = "jeldon-store";
function utf8ToBase64(s) {
  return btoa(unescape(encodeURIComponent(s)));
}
function base64ToUtf8(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ""))));
}
var GitHubStore = class {
  env;
  contentDir;
  codec;
  validate;
  userAgent;
  fetchImpl;
  constructor(opts) {
    this.env = opts.env;
    this.contentDir = (opts.contentDir ?? DEFAULT_CONTENT_DIR).replace(/\/+$/, "");
    this.codec = opts.codec ?? defaultFrontmatterCodec;
    this.validate = opts.validate;
    this.userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }
  articlePath(slug) {
    return `${this.contentDir}/${slug}.md`;
  }
  api(path, init = {}) {
    const url = `https://api.github.com/repos/${this.env.owner}/${this.env.repo}${path}`;
    return this.fetchImpl(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.env.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": this.userAgent,
        ...init.headers ?? {}
      }
    });
  }
  async listArticles() {
    const res = await this.api(`/contents/${this.contentDir}?ref=${this.env.branch}`);
    if (!res.ok) throw new Error(`GitHub list failed: ${res.status} ${await res.text()}`);
    const items = await res.json();
    return items.filter((i) => i.type === "file" && i.name.endsWith(".md")).map((i) => ({ slug: i.name.replace(/\.md$/, ""), path: i.path, sha: i.sha }));
  }
  async getArticle(slug) {
    const path = this.articlePath(slug);
    const res = await this.api(`/contents/${path}?ref=${this.env.branch}`);
    if (!res.ok) throw new Error(`GitHub get failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const content = data.encoding === "base64" ? base64ToUtf8(data.content) : data.content;
    return { slug, path: data.path, sha: data.sha, content };
  }
  /** Low-level Contents-API PUT. Throws on any non-OK response (the conflict
   *  recovery lives in `saveArticle`). */
  async putContents(path, content, sha, message) {
    const body = {
      message,
      content: utf8ToBase64(content),
      branch: this.env.branch
    };
    if (sha) body.sha = sha;
    const res = await this.api(`/contents/${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      throw new Error(`GitHub save failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    return { sha: data.content.sha };
  }
  async saveArticle(slug, content, sha, message) {
    if (this.validate) {
      const errors = this.validate(content);
      if (errors.length) {
        throw new Error(
          `Invalid article frontmatter \u2014 not saved:
- ${errors.join("\n- ")}`
        );
      }
    }
    const path = this.articlePath(slug);
    try {
      const result = await this.putContents(path, content, sha, message);
      return { sha: result.sha };
    } catch (err) {
      const errMsg = err.message;
      if (!/409|expected|conflict|sha/i.test(errMsg)) throw err;
      const fresh = await this.getArticle(slug);
      const current = this.codec.parse(fresh.content);
      const incoming = this.codec.parse(content);
      const mergedFm = { ...incoming.frontmatter };
      for (const [k, v] of Object.entries(current.frontmatter)) {
        if (!(k in mergedFm)) mergedFm[k] = v;
      }
      const merged = this.codec.serialize({ frontmatter: mergedFm, body: incoming.body });
      const result = await this.putContents(
        path,
        merged,
        fresh.sha,
        `${message} (merged with concurrent change)`
      );
      return { sha: result.sha, mergedFromConflict: true };
    }
  }
  async saveArticles(files, message) {
    const tree = files.map((f) => ({
      path: this.articlePath(f.slug),
      content: f.content
    }));
    return this.commitTree(tree, message);
  }
  async deleteArticle(slug, sha, message) {
    const path = this.articlePath(slug);
    const res = await this.api(`/contents/${path}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sha, branch: this.env.branch })
    });
    if (!res.ok) throw new Error(`GitHub delete failed: ${res.status} ${await res.text()}`);
  }
  async deleteArticles(slugs, message) {
    const tree = slugs.map((slug) => ({ path: this.articlePath(slug), sha: null }));
    return this.commitTree(tree, message);
  }
  async getDataFile(path) {
    const res = await this.api(`/contents/${path}?ref=${this.env.branch}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub get-file failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const content = data.encoding === "base64" ? base64ToUtf8(data.content) : data.content;
    return { path, sha: data.sha, content };
  }
  async saveDataFile(path, content, sha, message) {
    const result = await this.putContents(path, content, sha, message);
    return { sha: result.sha };
  }
  /**
   * Atomic multi-file commit via the Trees/Commits API. Either all entries
   * write or none. Entries are `{ path, content }` (blob) or `{ path, sha:null }`
   * (delete). Ported from BoH `saveArticles` / `deleteArticles`.
   */
  async commitTree(entries, message) {
    const refRes = await this.api(`/git/ref/heads/${this.env.branch}`);
    if (!refRes.ok) throw new Error(`GitHub get-ref failed: ${refRes.status} ${await refRes.text()}`);
    const ref = await refRes.json();
    const baseCommitSha = ref.object.sha;
    const commitRes = await this.api(`/git/commits/${baseCommitSha}`);
    if (!commitRes.ok) throw new Error(`GitHub get-commit failed: ${commitRes.status}`);
    const baseCommit = await commitRes.json();
    const treeEntries = await Promise.all(
      entries.map(async (e) => {
        if (e.content === void 0) {
          return { path: e.path, mode: "100644", type: "blob", sha: null };
        }
        const blobRes = await this.api(`/git/blobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: utf8ToBase64(e.content), encoding: "base64" })
        });
        if (!blobRes.ok) throw new Error(`GitHub blob failed: ${blobRes.status} ${await blobRes.text()}`);
        const blob = await blobRes.json();
        return { path: e.path, mode: "100644", type: "blob", sha: blob.sha };
      })
    );
    const treeRes = await this.api(`/git/trees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: treeEntries })
    });
    if (!treeRes.ok) throw new Error(`GitHub tree failed: ${treeRes.status} ${await treeRes.text()}`);
    const tree = await treeRes.json();
    const newCommitRes = await this.api(`/git/commits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, tree: tree.sha, parents: [baseCommitSha] })
    });
    if (!newCommitRes.ok) throw new Error(`GitHub commit failed: ${newCommitRes.status} ${await newCommitRes.text()}`);
    const newCommit = await newCommitRes.json();
    const updateRes = await this.api(`/git/refs/heads/${this.env.branch}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha: newCommit.sha, force: false })
    });
    if (!updateRes.ok) throw new Error(`GitHub ref update failed: ${updateRes.status} ${await updateRes.text()}`);
    return { commitSha: newCommit.sha };
  }
};

// src/fs-store.ts
import { createHash } from "crypto";
import {
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
var DEFAULT_CONTENT_DIR2 = "src/content/articles";
function hashContent(content) {
  return createHash("sha1").update(content, "utf8").digest("hex");
}
var FsStore = class {
  rootDir;
  contentDir;
  codec;
  validate;
  /** Serializes mutations so concurrent multi-file writes don't interleave. */
  lock = Promise.resolve();
  constructor(opts) {
    this.rootDir = resolve(opts.rootDir);
    this.contentDir = (opts.contentDir ?? DEFAULT_CONTENT_DIR2).replace(/\/+$/, "");
    this.codec = opts.codec ?? defaultFrontmatterCodec;
    this.validate = opts.validate;
  }
  articleAbsPath(slug) {
    return join(this.rootDir, this.contentDir, `${slug}.md`);
  }
  articleRelPath(slug) {
    return `${this.contentDir}/${slug}.md`;
  }
  /** Run a mutation under the process-local mutex. */
  serialize(fn) {
    const run = this.lock.then(fn, fn);
    this.lock = run.then(
      () => void 0,
      () => void 0
    );
    return run;
  }
  async listArticles() {
    const dir = join(this.rootDir, this.contentDir);
    if (!existsSync(dir)) return [];
    const names = await readdir(dir);
    const out = [];
    for (const name of names) {
      if (!name.endsWith(".md")) continue;
      const slug = name.replace(/\.md$/, "");
      const content = await readFile(join(dir, name), "utf8");
      out.push({ slug, path: this.articleRelPath(slug), sha: hashContent(content) });
    }
    return out;
  }
  async getArticle(slug) {
    const abs = this.articleAbsPath(slug);
    if (!existsSync(abs)) throw new Error(`FsStore get failed: ${this.articleRelPath(slug)} not found`);
    const content = await readFile(abs, "utf8");
    return { slug, path: this.articleRelPath(slug), sha: hashContent(content), content };
  }
  async saveArticle(slug, content, sha, _message) {
    if (this.validate) {
      const errors = this.validate(content);
      if (errors.length) {
        throw new Error(`Invalid article frontmatter \u2014 not saved:
- ${errors.join("\n- ")}`);
      }
    }
    return this.serialize(async () => {
      const abs = this.articleAbsPath(slug);
      const exists = existsSync(abs);
      if (sha && exists) {
        const onDisk = await readFile(abs, "utf8");
        const currentSha = hashContent(onDisk);
        if (currentSha !== sha) {
          const current = this.codec.parse(onDisk);
          const incoming = this.codec.parse(content);
          const mergedFm = { ...incoming.frontmatter };
          for (const [k, v] of Object.entries(current.frontmatter)) {
            if (!(k in mergedFm)) mergedFm[k] = v;
          }
          const merged = this.codec.serialize({ frontmatter: mergedFm, body: incoming.body });
          await mkdir(dirname(abs), { recursive: true });
          await writeFile(abs, merged, "utf8");
          return { sha: hashContent(merged), mergedFromConflict: true };
        }
      }
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content, "utf8");
      return { sha: hashContent(content) };
    });
  }
  async saveArticles(files, message) {
    return this.serialize(async () => {
      for (const f of files) {
        const abs = this.articleAbsPath(f.slug);
        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, f.content, "utf8");
      }
      return { commitSha: hashContent(message + files.map((f) => f.slug).join(",") + Date.now()) };
    });
  }
  async deleteArticle(slug, _sha, _message) {
    await this.serialize(async () => {
      const abs = this.articleAbsPath(slug);
      if (existsSync(abs)) await rm(abs);
    });
  }
  async deleteArticles(slugs, message) {
    return this.serialize(async () => {
      for (const slug of slugs) {
        const abs = this.articleAbsPath(slug);
        if (existsSync(abs)) await rm(abs);
      }
      return { commitSha: hashContent(message + slugs.join(",") + Date.now()) };
    });
  }
  async getDataFile(path) {
    const abs = join(this.rootDir, path);
    if (!existsSync(abs)) return null;
    const content = await readFile(abs, "utf8");
    return { path: relative(this.rootDir, abs).replace(/\\/g, "/"), sha: hashContent(content), content };
  }
  async saveDataFile(path, content, _sha, _message) {
    return this.serialize(async () => {
      const abs = join(this.rootDir, path);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content, "utf8");
      return { sha: hashContent(content) };
    });
  }
};

// src/factory.ts
function createStore(pack, opts = {}) {
  const kind = pack.services.store;
  const contentDir = opts.contentDir ?? pack.services.contentDir;
  if (kind === "fs") {
    if (!opts.rootDir) {
      throw new Error("createStore: services.store='fs' requires opts.rootDir");
    }
    return new FsStore({
      rootDir: opts.rootDir,
      contentDir,
      codec: opts.codec,
      validate: opts.validate
    });
  }
  return new GitHubStore({
    env: readGitHubEnv(opts.locals),
    contentDir,
    codec: opts.codec,
    validate: opts.validate,
    fetchImpl: opts.fetchImpl,
    userAgent: opts.userAgent
  });
}
export {
  FsStore,
  GitHubStore,
  createStore,
  defaultFrontmatterCodec,
  readGitHubEnv,
  resolveEnvBag
};
