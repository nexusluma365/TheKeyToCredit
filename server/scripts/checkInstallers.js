import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import os from 'os';
import 'dotenv/config';

const installersDir = process.env.INSTALLERS_DIR || path.join(process.cwd(), 'installers');

// Each entry lists accepted filenames for that installer slot (first match wins).
const required = [
  { label: 'Windows installer', kind: 'windows', candidates: ['CreditAnalyzer Setup.exe', 'CreditAnalyzer-Windows.exe'] },
  { label: 'Mac installer', kind: 'mac', candidates: ['CreditAnalyzer.dmg', 'CreditAnalyzer-Mac.dmg'] },
];

console.log(`Checking installer repository: ${installersDir}\n`);

let allPresent = true;

function sha256File(filePath) {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function formatMb(bytes) {
  return `${(bytes / 1000 / 1000).toFixed(1)} MB`;
}

function validateInstaller(kind, filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size <= 0) {
    throw new Error('file is empty or invalid');
  }

  if (kind === 'windows') {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(2);
    try {
      fs.readSync(fd, buffer, 0, 2, 0);
    } finally {
      fs.closeSync(fd);
    }
    const magic = buffer.toString('ascii');
    if (magic !== 'MZ') throw new Error('Windows installer does not have an MZ executable header');
  }

  if (kind === 'mac' && os.platform() === 'darwin') {
    execFileSync('hdiutil', ['verify', filePath], { stdio: 'ignore' });
  }

  return { bytes: stat.size, sha256: sha256File(filePath) };
}

for (const { label, kind, candidates } of required) {
  const found = candidates.find((f) => fs.existsSync(path.join(installersDir, f)));
  if (!found) {
    console.log(`✘ ${label} — checked: ${candidates.join(', ')}`);
    allPresent = false;
    continue;
  }

  const filePath = path.join(installersDir, found);
  try {
    const result = validateInstaller(kind, filePath);
    console.log(`✔ ${label} (${found}) ${formatMb(result.bytes)} sha256=${result.sha256}`);
  } catch (err) {
    console.log(`✘ ${label} (${found}) failed validation: ${err.message}`);
    allPresent = false;
  }
}

if (!allPresent) {
  console.log(
    `\nMissing installer(s). Place production builds in:\n  ${installersDir}\n`
  );
  process.exit(1);
}

console.log('\nAll required installers are present. Ready for fulfillment.');
