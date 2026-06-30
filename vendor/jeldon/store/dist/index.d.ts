import { DomainPack } from '@jeldon/config';

/**
 * The Store contract — the engine's only door to content persistence.
 *
 * Ported from Body of Health `src/lib/admin/github.ts` (the GitHub-as-database
 * pattern) + `src/pages/api/admin/drafts/[slug].ts` (the PUT SHA-conflict merge).
 * Per docs/DECOUPLING-NOTES.md "GitHub-as-database": reach content through this
 * interface, never through `github.ts` directly. `GitHubStore` is the default
 * adapter; `FsStore` is the test / non-GitHub fallback.
 */
/** A versioned article, addressed by slug. `sha` is the optimistic-concurrency
 *  token (GitHub blob sha; FsStore synthesizes a content hash). */
interface ArticleFile {
    slug: string;
    /** Repo-relative path, e.g. `src/content/articles/<slug>.md`. */
    path: string;
    sha: string;
    /** Full markdown including frontmatter. */
    content: string;
}
interface ArticleListing {
    slug: string;
    path: string;
    sha: string;
}
/** One file in an atomic multi-write. */
interface FileWrite {
    slug: string;
    content: string;
}
/** A versioned generic JSON/data file, addressed by repo-relative path. */
interface DataFile {
    path: string;
    sha: string;
    content: string;
}
interface SaveResult {
    sha: string;
    /** True when a 409 conflict triggered the re-fetch + frontmatter-merge path. */
    mergedFromConflict?: boolean;
}
interface CommitResult {
    commitSha: string;
}
/**
 * Persistence contract. Implementations: `GitHubStore` (Contents/Trees API),
 * `FsStore` (local filesystem). The conflict semantics live in `saveArticle`:
 * on a 409 the store re-fetches, merges frontmatter (out-of-band fields on the
 * remote that the incoming version doesn't know about are preserved), and
 * retries once — exactly the `[slug].ts` PUT recovery path.
 */
interface Store {
    /** List every article (slug + path + sha). */
    listArticles(): Promise<ArticleListing[]>;
    /** Read one article. Throws if missing. */
    getArticle(slug: string): Promise<ArticleFile>;
    /**
     * Save one article. Pass the `sha` you read to enable optimistic concurrency.
     * On a 409 conflict the store re-fetches the current file, merges frontmatter
     * (the incoming body + known fields win; remote-only fields like audio
     * metadata are preserved), and retries once. Pass `sha: null` to create or
     * blind-overwrite.
     */
    saveArticle(slug: string, content: string, sha: string | null, message: string): Promise<SaveResult>;
    /** Atomic multi-file commit — all files write or none (series creation,
     *  cross-draft moves). */
    saveArticles(files: FileWrite[], message: string): Promise<CommitResult>;
    /** Delete one article (sha-checked). */
    deleteArticle(slug: string, sha: string, message: string): Promise<void>;
    /** Atomic multi-file delete. */
    deleteArticles(slugs: string[], message: string): Promise<CommitResult>;
    /** Read a generic data file by repo-relative path. `null` when absent. */
    getDataFile(path: string): Promise<DataFile | null>;
    /** Write a generic data file by repo-relative path. */
    saveDataFile(path: string, content: string, sha: string | null, message: string): Promise<SaveResult>;
}
/**
 * Pluggable frontmatter codec used by `saveArticle`'s conflict-merge. The store
 * doesn't hardcode any one domain's frontmatter dialect — it merges fields, so
 * it needs to parse + re-serialize. The default (`defaultFrontmatterCodec`) is
 * a faithful port of BoH `src/lib/admin/frontmatter.ts`; a project with a YAML
 * lib can inject its own.
 */
interface FrontmatterCodec {
    parse(raw: string): {
        frontmatter: Record<string, unknown>;
        body: string;
    };
    serialize(doc: {
        frontmatter: Record<string, unknown>;
        body: string;
    }): string;
}
/**
 * Optional pre-commit validation gate (the `validateArticleContent` call in the
 * BoH PUT handler). Return a list of error strings; non-empty rejects the save
 * before it commits. The engine ships no validator here — `@jeldon/content-model`
 * owns article validation. Inject one if you want the gate.
 */
type ContentValidator = (content: string) => string[];
/** GitHub coordinates. Resolved from env by `readGitHubEnv`. */
interface GitHubEnv {
    token: string;
    owner: string;
    repo: string;
    branch: string;
}

/**
 * Minimal frontmatter parser/serializer used by the store's conflict-merge.
 *
 * Faithful port of Body of Health `src/lib/admin/frontmatter.ts` — supports
 * strings, booleans, numbers (with the stringly-quoted-numeric healing that
 * stops `audioBodyLength: "10772"` from breaking content builds), and string
 * arrays. No YAML lib, so it stays Workers-bundle-small and isomorphic.
 *
 * This is only the DEFAULT codec. A project may inject its own `FrontmatterCodec`
 * (e.g. a real YAML lib) into `GitHubStore`/`FsStore` — the store merges through
 * the interface, not this file.
 */

declare const defaultFrontmatterCodec: FrontmatterCodec;

/**
 * GitHub credential resolution. Ported from BoH `github.ts::readEnv` — reads
 * from Cloudflare `locals.runtime.env` when present, else `process.env`. Keeps
 * the repo coordinates (token/owner/repo/branch) in the environment exactly as
 * the source system does; the engine never bakes them in.
 */

interface EnvBag {
    GITHUB_TOKEN?: string;
    GITHUB_OWNER?: string;
    GITHUB_REPO?: string;
    GITHUB_BRANCH?: string;
    [k: string]: string | undefined;
}
/** Pull the env bag out of a Cloudflare `locals` (or fall back to process.env). */
declare function resolveEnvBag(locals?: {
    runtime?: {
        env?: EnvBag;
    };
}): EnvBag;
/**
 * Read + validate GitHub coordinates. Throws the same readable error the source
 * system throws when any of the four are missing.
 */
declare function readGitHubEnv(locals?: {
    runtime?: {
        env?: EnvBag;
    };
}): GitHubEnv;

/**
 * GitHubStore — content persistence on the GitHub Contents + Trees/Commits API.
 *
 * Faithful port of Body of Health `src/lib/admin/github.ts` (read/list/save/
 * delete + atomic Tree commits) and `src/pages/api/admin/drafts/[slug].ts`
 * (the PUT SHA-conflict re-fetch + frontmatter-merge + single retry).
 *
 * Domain-agnostic changes vs the source:
 *  - The articles directory is config (`contentDir`), not the hardcoded
 *    `src/content/articles` literal.
 *  - The conflict-merge parses/serializes through an injected `FrontmatterCodec`
 *    (default = port of BoH frontmatter.ts) instead of importing BoH's parser.
 *  - The optional pre-commit `ContentValidator` is injected, not hardwired to
 *    BoH's `validateArticleContent`.
 */

interface GitHubStoreOptions {
    env: GitHubEnv;
    /** Repo-relative directory holding `<slug>.md` articles. Default
     *  `src/content/articles`. */
    contentDir?: string;
    /** Frontmatter codec for the conflict-merge. Default = BoH port. */
    codec?: FrontmatterCodec;
    /** Optional pre-commit gate (e.g. `@jeldon/content-model::validateArticle`).
     *  Returns error strings; non-empty rejects the save. */
    validate?: ContentValidator;
    /** Sent as the GitHub `User-Agent`. */
    userAgent?: string;
    /** Injectable fetch (tests, custom transports). Default = global `fetch`. */
    fetchImpl?: typeof fetch;
}
declare class GitHubStore implements Store {
    private readonly env;
    private readonly contentDir;
    private readonly codec;
    private readonly validate?;
    private readonly userAgent;
    private readonly fetchImpl;
    constructor(opts: GitHubStoreOptions);
    private articlePath;
    private api;
    listArticles(): Promise<ArticleListing[]>;
    getArticle(slug: string): Promise<ArticleFile>;
    /** Low-level Contents-API PUT. Throws on any non-OK response (the conflict
     *  recovery lives in `saveArticle`). */
    private putContents;
    saveArticle(slug: string, content: string, sha: string | null, message: string): Promise<SaveResult>;
    saveArticles(files: FileWrite[], message: string): Promise<CommitResult>;
    deleteArticle(slug: string, sha: string, message: string): Promise<void>;
    deleteArticles(slugs: string[], message: string): Promise<CommitResult>;
    getDataFile(path: string): Promise<DataFile | null>;
    saveDataFile(path: string, content: string, sha: string | null, message: string): Promise<SaveResult>;
    /**
     * Atomic multi-file commit via the Trees/Commits API. Either all entries
     * write or none. Entries are `{ path, content }` (blob) or `{ path, sha:null }`
     * (delete). Ported from BoH `saveArticles` / `deleteArticles`.
     */
    private commitTree;
}

/**
 * FsStore — local-filesystem implementation of the Store contract.
 *
 * The fallback for tests and non-GitHub hosts (per docs/DECOUPLING-NOTES.md:
 * "GitHubStore default + FsStore fallback"). There is no remote branch, so the
 * `sha` token is a synthesized content hash; multi-file writes are sequential
 * but treated as one logical commit (a process-local mutex serializes them so a
 * concurrent `saveArticles` can't interleave). The conflict-merge mirrors
 * `GitHubStore`: if the caller's `sha` no longer matches what's on disk, the
 * store re-reads, merges frontmatter (remote-only fields preserved), and retries.
 */

interface FsStoreOptions {
    /** Repo root. All paths resolve against this. */
    rootDir: string;
    /** Articles directory relative to `rootDir`. Default `src/content/articles`. */
    contentDir?: string;
    codec?: FrontmatterCodec;
    validate?: ContentValidator;
}
declare class FsStore implements Store {
    private readonly rootDir;
    private readonly contentDir;
    private readonly codec;
    private readonly validate?;
    /** Serializes mutations so concurrent multi-file writes don't interleave. */
    private lock;
    constructor(opts: FsStoreOptions);
    private articleAbsPath;
    private articleRelPath;
    /** Run a mutation under the process-local mutex. */
    private serialize;
    listArticles(): Promise<ArticleListing[]>;
    getArticle(slug: string): Promise<ArticleFile>;
    saveArticle(slug: string, content: string, sha: string | null, _message: string): Promise<SaveResult>;
    saveArticles(files: FileWrite[], message: string): Promise<CommitResult>;
    deleteArticle(slug: string, _sha: string, _message: string): Promise<void>;
    deleteArticles(slugs: string[], message: string): Promise<CommitResult>;
    getDataFile(path: string): Promise<DataFile | null>;
    saveDataFile(path: string, content: string, _sha: string | null, _message: string): Promise<SaveResult>;
}

/**
 * Store factory — picks the adapter from `pack.services.store` so callers never
 * branch on the host. `'github'` → `GitHubStore` (reads GitHub coordinates from
 * env); `'fs'` → `FsStore` (needs a `rootDir`).
 */

interface CreateStoreOptions {
    /** Articles directory relative to repo root. Default `src/content/articles`. */
    contentDir?: string;
    /** Frontmatter codec for the conflict-merge. Default = BoH port. */
    codec?: FrontmatterCodec;
    /** Optional pre-commit validation gate. */
    validate?: ContentValidator;
    /** Cloudflare `locals` (or omit to read process.env) — GitHub path only. */
    locals?: {
        runtime?: {
            env?: Record<string, string | undefined>;
        };
    };
    /** Repo root — required for the `fs` path. */
    rootDir?: string;
    /** Injectable fetch — GitHub path only (tests). */
    fetchImpl?: typeof fetch;
    /** GitHub `User-Agent`. */
    userAgent?: string;
}
/**
 * Build the Store the loaded Domain Pack asks for. The `kind` defaults to
 * `pack.services.store` but can be forced.
 */
declare function createStore(pack: Pick<DomainPack, 'services'>, opts?: CreateStoreOptions): Store;

export { type ArticleFile, type ArticleListing, type CommitResult, type ContentValidator, type CreateStoreOptions, type DataFile, type FileWrite, type FrontmatterCodec, FsStore, type FsStoreOptions, type GitHubEnv, GitHubStore, type GitHubStoreOptions, type SaveResult, type Store, createStore, defaultFrontmatterCodec, readGitHubEnv, resolveEnvBag };
