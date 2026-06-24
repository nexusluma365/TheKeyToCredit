import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const installersDir = process.env.INSTALLERS_DIR || path.join(process.cwd(), 'installers');

// Each entry lists accepted filenames for that installer slot (first match wins).
const required = [
  { label: 'Windows installer', candidates: ['CreditAnalyzer Setup.exe', 'CreditAnalyzer-Windows.exe'] },
  { label: 'Mac installer',     candidates: ['CreditAnalyzer.dmg', 'CreditAnalyzer-Mac.dmg'] },
];

console.log(`Checking installer repository: ${installersDir}\n`);

let allPresent = true;

for (const { label, candidates } of required) {
  const found = candidates.find((f) => fs.existsSync(path.join(installersDir, f)));
  console.log(`${found ? '✔' : '✘'} ${label}${found ? ` (${found})` : ` — checked: ${candidates.join(', ')}`}`);
  if (!found) allPresent = false;
}

if (!allPresent) {
  console.log(
    `\nMissing installer(s). Place production builds in:\n  ${installersDir}\n`
  );
  process.exit(1);
}

console.log('\nAll required installers are present. Ready for fulfillment.');
