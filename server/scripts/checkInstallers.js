import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const installersDir = process.env.INSTALLERS_DIR || path.join(process.cwd(), 'installers');
const required = ['CreditAnalyzer-Windows.exe', 'CreditAnalyzer-Mac.dmg'];

console.log(`Checking installer repository: ${installersDir}\n`);

let allPresent = true;

for (const file of required) {
  const filePath = path.join(installersDir, file);
  const exists = fs.existsSync(filePath);
  console.log(`${exists ? '✔' : '✘'} ${file}`);
  if (!exists) allPresent = false;
}

if (!allPresent) {
  console.log(
    `\nMissing installer(s). Place production builds in:\n  ${installersDir}\n`
  );
  process.exit(1);
}

console.log('\nAll required installers are present. Ready for fulfillment.');
