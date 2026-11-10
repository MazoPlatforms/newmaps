import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { listMapDataSnapshotFiles } from './map-data-snapshot-files.mjs';

const root = process.env.MAZO_LIVE_DATA_ROOT || new URL('../.build/live-data/', import.meta.url).pathname;
const repository = process.env.GITHUB_REPOSITORY || 'MazoPlatforms/newmaps';
const token = process.env.GITHUB_TOKEN;
if (!token || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('GitHub token and repository are required');

const scratch = await mkdtemp(join(tmpdir(), 'mazo-data-snapshot-'));
const askpass = join(scratch, 'askpass.sh');
try {
  const snapshot = join(scratch, 'repo');
  const { execFileSync } = await import('node:child_process');
  const git = (args, options = {}) => execFileSync('git', args, { cwd: snapshot, stdio: 'pipe', ...options }).toString().trim();
  await (await import('node:fs/promises')).mkdir(snapshot);
  await writeFile(askpass, '#!/bin/sh\nprintf "%s" "$GITHUB_TOKEN"\n', { mode: 0o700 });
  git(['init', '-q']);
  const origin = `https://github.com/${repository}.git`;
  git(['remote', 'add', 'origin', origin]);
  const authEnv = { ...process.env, GIT_ASKPASS: askpass, GIT_TERMINAL_PROMPT: '0' };
  let previous;
  try {
    previous = execFileSync('git', ['ls-remote', '--heads', 'origin', 'refs/heads/map-data'],
      { cwd: snapshot, stdio: 'pipe', env: authEnv }).toString().trim();
  } catch { throw new Error('Could not read the GitHub map-data snapshot branch'); }
  if (previous) {
    git(['fetch', '-q', 'origin', 'refs/heads/map-data:refs/remotes/origin/map-data'], { env: authEnv });
    git(['checkout', '-q', '-b', 'map-data', 'refs/remotes/origin/map-data']);
    git(['rm', '-r', '-q', '--ignore-unmatch', '--', '.']);
  } else {
    git(['checkout', '-q', '--orphan', 'map-data']);
  }
  git(['config', 'user.name', 'github-actions[bot]']);
  git(['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
  for (const { path, relative } of await listMapDataSnapshotFiles(root)) {
    const target = join(snapshot, relative);
    await (await import('node:fs/promises')).mkdir(join(target, '..'), { recursive: true });
    await cp(path, target);
  }
  git(['add', '-A']);
  if (!git(['status', '--porcelain'])) throw new Error('Refusing to publish an empty map-data snapshot');
  git(['commit', '--allow-empty', '-q', '-m', `Map data snapshot ${process.env.GITHUB_SHA || 'manual'}`]);
  const revision = git(['rev-parse', 'HEAD']);
  execFileSync('git', ['push', 'origin', 'HEAD:refs/heads/map-data'], { cwd: snapshot, stdio: 'pipe', env: authEnv });
  console.log(`artifact_revision=${revision}`);
  if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `artifact_revision=${revision}\n`, { flag: 'a' });
} finally {
  await rm(scratch, { recursive: true, force: true });
}
