// Keeps Claude's project memory (outside the repo) and the memory/ folder of this checkout equal.
//
//   pnpm memory:sync             both ways: the newest copy of each .md file wins
//   pnpm memory:sync --dry-run   only says what it would copy
//
// Claude Code keeps the memory of a project in ~/.claude/projects/<path with - for : \ />/memory
// (D:\InroConta → D--InroConta). That folder lives in one machine; memory/ is a plain git
// checkout of its own (a PRIVATE repository, ignored by this public one) that travels between
// machines: run the sync before and after working. Nothing is ever deleted.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, utimesSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const dryRun = process.argv.includes('--dry-run');

const claudeDir = process.env.MEMORY_CLAUDE_DIR?.trim() || join(homedir(), '.claude', 'projects', ROOT.replace(/[:\\/]/g, '-'), 'memory');
const repoDir = process.env.MEMORY_REPO_DIR?.trim() || join(ROOT, 'memory');

mkdirSync(repoDir, { recursive: true });
if (!existsSync(claudeDir)) {
    if (dryRun) console.log(`(dry run) ${claudeDir} does not exist yet: it would be created.`);
    else mkdirSync(claudeDir, { recursive: true });
}

const notes = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.md')) : []);
const sameContent = (a: string, b: string) => readFileSync(a).equals(readFileSync(b));

let copied = 0;
let equal = 0;
for (const name of new Set([...notes(claudeDir), ...notes(repoDir)])) {
    const inClaude = join(claudeDir, name);
    const inRepo = join(repoDir, name);
    const [from, to, direction] = !existsSync(inRepo)
        ? [inClaude, inRepo, 'Claude → memory/']
        : !existsSync(inClaude)
          ? [inRepo, inClaude, 'memory/ → Claude']
          : sameContent(inClaude, inRepo)
            ? [null, null, '']
            : statSync(inClaude).mtimeMs >= statSync(inRepo).mtimeMs
              ? [inClaude, inRepo, 'Claude → memory/']
              : [inRepo, inClaude, 'memory/ → Claude'];
    if (!from || !to) {
        equal++;
        continue;
    }
    console.log(`${dryRun ? '(dry run) ' : ''}${name}  ${direction}`);
    if (!dryRun) {
        copyFileSync(from, to);
        // The copy keeps the date of the original, so the next run sees both as the same age.
        const { atime, mtime } = statSync(from);
        utimesSync(to, atime, mtime);
    }
    copied++;
}
console.log(`${copied} ${dryRun ? 'would be copied' : 'copied'}, ${equal} already equal.\nClaude: ${claudeDir}\nmemory/: ${repoDir}`);
