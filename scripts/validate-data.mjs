// Validates the JSON game data in src/data (filled in as data files are added).
import { readdirSync, readFileSync } from 'node:fs';
const dir = new URL('../src/data/', import.meta.url);
let n = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
  n++;
}
console.log(`data ok (${n} files)`);
