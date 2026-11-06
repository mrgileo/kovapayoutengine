// Writes realistic Kovadash test data to disk so the upload path can be tried for real.
//   node scripts/generate-data.mjs                 -> ~/Downloads/kova-test-data/{medium,small,bad}
//   node scripts/generate-data.mjs C:\some\folder  -> that folder instead
// Same seed, same files, every time.

import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DATASETS, expectedText, generateBadFiles, generateDataset } from "./data-gen.mjs";
import { addBankStatement } from "./data-bank.mjs";

const root = process.argv[2] ? path.resolve(process.argv[2]) : path.join(os.homedir(), "Downloads", "kova-test-data");

async function write(dir, files) {
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text, "utf8");
}

for (const [name, cfg] of Object.entries(DATASETS)) {
  const t0 = Date.now();
  const set = generateDataset(cfg);
  await addBankStatement(set); // adds bank_statement.csv and the planted payout problems
  const dir = path.join(root, name);
  await write(dir, { ...set.files, "EXPECTED.txt": expectedText(set.expected), "expected.json": JSON.stringify(set.expected, null, 2) });
  const kb = (s) => `${Math.round(s.length / 1024).toLocaleString()} KB`;
  console.log(`\n${name}: ${set.expected.counts.orders.toLocaleString()} orders, ${set.expected.counts.leads.toLocaleString()} leads -> ${dir} (${Date.now() - t0} ms)`);
  for (const [f, text] of Object.entries(set.files)) console.log(`  ${f.padEnd(26)} ${kb(text).padStart(10)}`);
}

const bad = generateBadFiles();
await write(path.join(root, "bad"), {
  ...bad.files,
  "EXPECTED.txt": [
    "Each *_bad.csv has one clean row and then one mistake per line. Import with the matching good files (products.csv and staff.csv from small/) and expect an error on exactly these lines:",
    ...Object.entries(bad.errorLines).flatMap(([f, m]) => [`${f}:`, ...Object.entries(m).map(([line, col]) => `  line ${line}: ${col}`)]),
    "",
  ].join("\n"),
});
console.log(`\nbad: ${Object.keys(bad.files).length} files -> ${path.join(root, "bad")}`);
console.log("\nDone.");
