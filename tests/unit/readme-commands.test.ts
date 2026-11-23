import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The README is the owner's runbook (T011). This keeps it honest: every `npm run <script>` it mentions exists, every repo path it
 * mentions exists (or is a documented local-only folder), and the Node version it states is the one in .nvmrc.
 */
const root = process.cwd();
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string>; engines: { node: string } };
const gitignore = readFileSync(join(root, '.gitignore'), 'utf8').split('\n').map((l) => l.trim());

/** Folders the README names that are local-only on purpose: they must be in .gitignore, and need not exist in a clean clone. */
const LOCAL_ONLY = ['data/source', 'data/work'];

const isLocalOnly = (p: string) => LOCAL_ONLY.some((d) => p === d || p.startsWith(`${d}/`));

function npmScriptsMentioned(text: string): string[] {
  return [...new Set([...text.matchAll(/\bnpm run ([A-Za-z0-9:_-]+)/g)].map((m) => m[1]!))];
}

/** Repo paths mentioned in the README, cut before any glob or placeholder (`*`, `{`, `<`, `[`) so `public/data/*.json` checks `public/data`. */
function pathsMentioned(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?<![\w/.])(?:data|scripts|docs|public|tests|sprints|src)\/[^\s`'"),;:]*/g)) {
    let token = m[0].replace(/[.]+$/, '');
    const cut = token.search(/[*{<[]/);
    if (cut !== -1) {
      token = token.slice(0, cut);
      if (!token.endsWith('/')) token = dirname(token);
    }
    token = token.replace(/\/+$/, '');
    if (token !== '') out.add(token);
  }
  return [...out].sort();
}

/** Root-level files named in backticks, such as `PRD.md` or `vercel.json`, plus `.nvmrc`. */
function rootFilesMentioned(text: string): string[] {
  const names = [...text.matchAll(/`([A-Za-z0-9_.-]+\.(?:md|json|mjs|mts|ts|js))`/g)].map((m) => m[1]!);
  if (/`\.nvmrc`|\.nvmrc/.test(text)) names.push('.nvmrc');
  return [...new Set(names)].sort();
}

describe('README commands and paths', () => {
  it('mentions the commands of the update flow', () => {
    const scripts = npmScriptsMentioned(readme);
    for (const s of ['import', 'build:data', 'build', 'qa', 'qa:full', 'test:live', 'dev']) expect(scripts).toContain(s);
  });

  it('every `npm run <script>` it mentions exists in package.json', () => {
    for (const s of npmScriptsMentioned(readme)) expect(Object.keys(pkg.scripts), `npm run ${s}`).toContain(s);
  });

  it('every repo path it mentions exists, or is a documented local-only folder', () => {
    const paths = pathsMentioned(readme);
    expect(paths.length).toBeGreaterThan(10);
    for (const p of paths) {
      if (isLocalOnly(p)) continue;
      expect(existsSync(join(root, p)), `README mentions ${p}, which does not exist`).toBe(true);
    }
  });

  it('every root file it names exists', () => {
    for (const f of rootFilesMentioned(readme)) expect(existsSync(join(root, f)), `README mentions ${f}, which does not exist`).toBe(true);
  });

  it('the local-only folders are ignored by git, and the README says the PDF folder is ignored', () => {
    for (const d of LOCAL_ONLY) expect(gitignore, d).toContain(`${d}/`);
    expect(readme).toMatch(/This folder is ignored by git/);
  });

  it('the Node version it states is the .nvmrc version, and satisfies package.json engines', () => {
    const nvmrc = readFileSync(join(root, '.nvmrc'), 'utf8').trim();
    const stated = [...readme.matchAll(/\b\d{2}\.\d+\.\d+\b/g)].map((m) => m[0]);
    expect(stated.length).toBeGreaterThan(0);
    for (const v of stated) expect(v).toBe(nvmrc);
    expect(pkg.engines.node).toContain(nvmrc);
  });

  it('the files that change in an update are the ones that exist and the README tells the owner not to commit the PDF', () => {
    for (const f of ['public/data/songs.json', 'public/data/artists.json', 'data/reports/import.md', 'data/reports/artists-review.md', 'data/artist-merges.json']) {
      expect(readme, f).toContain(f);
      expect(existsSync(join(root, f)), f).toBe(true);
    }
    expect(readme).toMatch(/\*\*Not\*\* the PDF/);
  });

  it('keeps the commit rules and search visibility sections', () => {
    expect(readme).toMatch(/^## Commit rules$/m);
    expect(readme).toMatch(/^## Search visibility$/m);
  });
});


/* ---------- T011 QA hardening: numbers, ports, messages and commands the README quotes must match the code and the reports ---------- */

const read = (p: string) => readFileSync(join(root, p), 'utf8');
/** The file as committed at HEAD (the owner mid-update has new working files but the README still describes the last published book). */
function committed(p: string): string | null {
  try {
    return execFileSync('git', ['show', `HEAD:${p}`], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}
/** Both the working copy and the committed copy are acceptable sources for a quoted figure. */
function versions(p: string): string[] {
  return [read(p), committed(p)].filter((x): x is string => x !== null);
}
const importMd = versions('data/reports/import.md');
const num = (s: string) => Number(s.replace(/,/g, ''));
const importRows = (t: string) => num(/Rows parsed: \*\*(\d+)\*\*/.exec(t)![1]!);
const importEmptyArtist = (t: string) => num(/with empty artist: \*\*(\d+)\*\*/.exec(t)![1]!);

interface Block { lang: string; text: string }
const blocks: Block[] = [...readme.matchAll(/^```(\w*)\n([\s\S]*?)^```/gm)].map((m) => ({ lang: m[1]!, text: m[2]! }));
const shellLines = blocks
  .filter((b) => b.lang === '')
  .flatMap((b) => b.text.split('\n'))
  .map((l) => l.trim())
  .filter((l) => l !== '' && !l.startsWith('#'));

const scriptsText = readdirSync(join(root, 'scripts/import'))
  .filter((f) => f.endsWith('.ts'))
  .map((f) => read(`scripts/import/${f}`))
  .join('\n');

describe('README quoted facts match the code and the committed data', () => {
  it('the port it serves on is the port Playwright uses', () => {
    const port = /const PORT = (\d+);/.exec(read('playwright.config.ts'))![1]!;
    const served = [...readme.matchAll(/serve-out\.mjs (\d+) out/g)].map((m) => m[1]);
    expect(served.length).toBeGreaterThan(0);
    for (const p of served) expect(p).toBe(port);
    const urls = [...readme.matchAll(/http:\/\/127\.0\.0\.1:(\d+)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const p of urls) expect(p).toBe(port);
  });

  it('the single `git add` command lists all five update files and nothing broad', () => {
    const adds = shellLines.filter((l) => l.startsWith('git add'));
    expect(adds).toHaveLength(1);
    const paths = adds[0]!.split(/\s+/).slice(2);
    expect(paths.sort()).toEqual(['data/artist-merges.json', 'data/reports/artists-review.md', 'data/reports/import.md', 'public/data/artists.json', 'public/data/songs.json']);
    expect(readme).toMatch(/Do NOT use `git add \.` or `git add -A`/);
  });

  it('the row count it quotes is the one in the import report (committed or working copy)', () => {
    const quoted = [...readme.matchAll(/previous book had \*\*([\d,]+)\*\*/g)].map((m) => num(m[1]!));
    const parsed = [...readme.matchAll(/^Parsed (\d+) rows from/gm)].map((m) => Number(m[1]));
    expect(quoted.length).toBeGreaterThan(0);
    expect(parsed.length).toBeGreaterThan(0);
    for (const q of [...quoted, ...parsed]) expect(importMd.map(importRows), `README quotes ${q}`).toContain(q);
    // the "more than 2%" window it prints: floor / ceil to 50 of count * 0.98 and * 1.02
    const rows = quoted[0]!;
    expect(readme).toContain(`below ${(Math.floor((rows * 0.98) / 50) * 50).toLocaleString('en-US')} or above ${(Math.ceil((rows * 1.02) / 50) * 50).toLocaleString('en-US')}`);
    expect(readme).toContain(`is more than 2% away from ${rows.toLocaleString('en-US')}`);
  });

  it('the empty-artist and Unknown numbers it explains match the reports', () => {
    const empty = importMd.map(importEmptyArtist);
    const reviews = versions('data/reports/artists-review.md');
    const unknown = reviews.map((t) => num(/listed under "Unknown": (\d+)/.exec(t)![1]!));
    const dotdot = reviews.map((t) => num(/(\d+) printed `\.\.`/.exec(t)![1]!));
    const m = /says \*\*(\d+)\*\* rows have an empty artist/.exec(readme);
    const n = /says \*\*(\d+)\*\* songs have an empty printed artist/.exec(readme);
    const d = /credits printed as just `\.\.` \((\d+) of them\)/.exec(readme);
    expect(m && n && d).toBeTruthy();
    expect(empty).toContain(Number(m![1]));
    expect(unknown).toContain(Number(n![1]));
    expect(dotdot).toContain(Number(d![1]));
    expect(Number(m![1]) + Number(d![1])).toBe(Number(n![1]));
    expect(readme).toContain(`Empty artists: the current book has **${m![1]}**`);
  });

  it('the dataset id it quotes (if any) is the id of the data (committed or working copy)', () => {
    const quoted = [...readme.matchAll(/Dataset id ([0-9a-f]{16})\./g)].map((m) => m[1]!);
    expect(quoted.length).toBeGreaterThan(0);
    const ids = ['public/data/artists.json', 'public/data/songs.json'].flatMap((p) => [read(p), committed(p)]).filter((x): x is string => x !== null).map((t) => /"id":"([0-9a-f]{16})"/.exec(t.slice(0, 200))![1]);
    for (const q of quoted) expect(ids, `README quotes id ${q}`).toContain(q);
  });

  it('the keepSeparate counts it says to expect match the merge file', () => {
    const merges = JSON.parse(read('data/artist-merges.json')) as Array<Record<string, unknown>>;
    const sep = merges.filter((e) => 'keepSeparate' in e).length;
    const rules = merges.length - sep;
    expect(readme).toContain(`keepSeparate groups applied: ${sep}\``);
    expect(readme).toContain(`${rules} rule(s) applied)`);
    // and the committed report agrees
    for (const t of versions('data/reports/artists-review.md')) expect(t).toContain(`\`keepSeparate\` groups applied: ${sep}`);
  });

  it('shows the WHOLE current merge file, as valid JSON, and warns never to replace it with one example', () => {
    const current = JSON.parse(read('data/artist-merges.json')) as unknown[];
    const jsonBlocks = blocks.filter((b) => b.lang === 'json').map((b) => JSON.parse(b.text) as unknown[]);
    expect(jsonBlocks.length).toBeGreaterThanOrEqual(2);
    expect(jsonBlocks.some((j) => JSON.stringify(j) === JSON.stringify(current))).toBe(true);
    for (const j of jsonBlocks) for (const e of current) expect(JSON.stringify(j), 'a README merge-file example drops a current entry').toContain(JSON.stringify(e).slice(1, -1));
    expect(readme).toContain('**Never replace the file with a single example.**');
    expect(readme).toContain('with a comma after every line except the last.**');
    expect(readme).toContain('A missing comma is the usual mistake.');
  });

  it('the error messages and phrases it quotes exist in the scripts', () => {
    const sources = `${scriptsText}\n${read('playwright.config.ts')}`;
    const quoted = [
      'No PDF found. Put the song book PDF in data/source/',
      'Expected exactly one PDF in data/source/, found',
      'Row accounting does not balance',
      'At least one page could not be parsed at all',
      'data/work/songs.raw.json not found',
      'Gzipped dataset exceeds the 1.5 MB budget',
      'problem(s) in data/artist-merges.json',
      'must be a JSON list',
      'WARNING: data/artist-merges.json was not found',
      'Import failed:',
      'balanced, nothing dropped silently',
      'out/index.html is missing',
    ];
    for (const q of quoted) {
      expect(sources, `scripts no longer contain "${q}"`).toContain(q);
      expect(readme, `README no longer quotes "${q}"`).toContain(q);
    }
    expect(sources).toContain('is not valid JSON');
    expect(sources).toContain(' near position ');
    expect(readme).toContain('is not valid JSON near position N');
    // the fake-PDF row: the script builds `pdftotext failed (exit N): <poppler stderr>`
    expect(scriptsText).toContain('pdftotext failed (exit ');
    expect(readme).toContain('pdftotext failed (exit 1)');
    expect(readme).toContain('Syntax Error');
    // the visitor message comes from the app
    const appText = readdirSync(join(root, 'src'), { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .map((f) => read(`src/${f}`))
      .join('\n');
    expect(appText).toContain("Couldn't load the song book. Check your connection and try again.");
    expect(readme).toContain("Couldn't load the song book. Check your connection and try again.");
  });

  it('every section letter it names exists as a heading in the artist report', () => {
    const headings = [...read('data/reports/artists-review.md').matchAll(/^## \(([a-z])\) /gm)].map((m) => m[1]);
    const named = [...new Set([...readme.matchAll(/(?:^|[\s*|])\(([a-z])\)(?=[\s*|.,]|$)/gm)].map((m) => m[1]!))];
    expect(named.length).toBeGreaterThanOrEqual(2);
    for (const l of named) expect(headings, `README names section (${l})`).toContain(l);
    // the table covers every section the report has
    for (const l of headings) expect(readme, `report section (${l}) is not in the README table`).toMatch(new RegExp(`\\(${l}\\)`));
  });

  it('the Vercel Node version it states is the one decision A-016 records', () => {
    const a016 = /### A-016[\s\S]*?Node\.js version `(\d+\.x)`/.exec(read('DECISIONS.md'))![1]!;
    const stated = [...readme.matchAll(/\b(\d+\.x)\b/g)].map((m) => m[1]);
    expect(stated.length).toBeGreaterThan(0);
    for (const v of stated) expect(v).toBe(a016);
  });

  it('describes the Vercel protection by effect, not by dashboard label', () => {
    expect(readme).not.toMatch(/Standard protection/);
    expect(readme).toMatch(/private\/incognito window/);
    expect(readme).toMatch(/must ask for a Vercel login/);
  });

  it('names the poppler packages the install table needs, as the import error does', () => {
    for (const cmd of ['sudo dnf install poppler-utils', 'sudo apt install poppler-utils', 'brew install poppler']) {
      expect(readme, cmd).toContain(cmd);
      expect(read('scripts/import/bbox.ts'), cmd).toContain(cmd.replace(/^sudo /, ''));
    }
  });
});

describe('README shell commands', () => {
  const TOOLS = ['npm', 'node', 'git', 'npx', 'nvm', 'mkdir', 'cd', 'cp', 'pdftotext', 'vercel', 'curl'];
  const NPM = new Set(['run', 'ci', 'install', 'test']);
  const GIT = new Set(['switch', 'pull', 'status', 'add', 'commit', 'push', 'restore']);

  it('every command in a code block starts with a known tool and a real subcommand', () => {
    expect(shellLines.length).toBeGreaterThan(15);
    for (const line of shellLines) {
      const words = line.replace(/^LIVE_URL=\S+\s+/, '').split(/\s+/);
      const [tool, sub] = [words[0]!, words[1]!];
      expect(TOOLS, `unknown command start: ${line}`).toContain(tool);
      if (tool === 'npm') expect(NPM.has(sub) || (sub === 'install' && words[2] === '-g'), `unknown npm subcommand: ${line}`).toBe(true);
      if (tool === 'git') expect(GIT, `unknown git subcommand: ${line}`).toContain(sub);
    }
  });

  it('every `git` and `npm` command written inline in the prose is spelled with a real subcommand', () => {
    for (const m of readme.matchAll(/`(npm|git) ([a-z:-]+)/g)) {
      const [, tool, sub] = m;
      if (tool === 'npm') expect(NPM, `README has \`npm ${sub}\``).toContain(sub);
      else expect(GIT, `README has \`git ${sub}\``).toContain(sub);
    }
  });

  it('the guard itself catches an `npm instal` typo', () => {
    const NPMSUBS = new Set(['run', 'ci', 'install', 'test']);
    expect(NPMSUBS.has('instal')).toBe(false);
    expect(NPMSUBS.has('install')).toBe(true);
  });

  it('has the readability pieces the owner needs', () => {
    for (const p of ['mkdir -p data/source', 'git restore public/data', 'node -v', 'Do not commit before `qa:full` is green', 'publishes nothing yet', 'a separate copy of the work: nothing goes live until you merge it', 'to accept the change and make it live']) {
      expect(readme, p).toContain(p);
    }
    // Step 2 and the table row for the missing folder both create it
    expect([...readme.matchAll(/mkdir -p data\/source/g)].length).toBeGreaterThanOrEqual(2);
  });
});

describe('README path extraction (guards the checks above)', () => {
  it('cuts globs and placeholders and ignores URL paths', () => {
    expect(pathsMentioned('see `public/data/*.json` and sprints/S0N-*/{todo}/ and data/source/<file>.pdf')).toEqual(['data/source', 'public/data', 'sprints']);
    expect(pathsMentioned('fetch /data/songs.json now')).toEqual([]);
  });
});
