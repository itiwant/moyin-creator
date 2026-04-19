import { readdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const releaseDir = resolve(projectRoot, 'release');
const buildDir = resolve(releaseDir, 'build');
const powershellScript = resolve(scriptDir, 'prebuild-cleanup.ps1');

function removeIfExists(targetPath) {
  if (!existsSync(targetPath)) {
    return;
  }

  rmSync(targetPath, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 500,
  });
}

try {
  if (process.platform === 'win32' && existsSync(powershellScript)) {
    const result = spawnSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', powershellScript],
      { stdio: 'inherit', cwd: projectRoot },
    );

    if ((result.status ?? 1) !== 0) {
      process.exit(result.status ?? 1);
    }
  } else {
    removeIfExists(buildDir);

    if (existsSync(releaseDir)) {
      for (const entry of readdirSync(releaseDir, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.startsWith('build-staging-')) {
          removeIfExists(resolve(releaseDir, entry.name));
        }
      }
    }
  }
} catch (error) {
  console.warn('Prebuild cleanup skipped:', error instanceof Error ? error.message : String(error));
}
