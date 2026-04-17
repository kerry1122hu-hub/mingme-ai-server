const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  normalizeMingSkyNarrativeOutput,
  validateMingSkyNarrativeOutputShape,
  SCHEMA_VERSION,
} = require('../src/services/mingskyNarrativeService');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  const fixturesDir = path.join(__dirname, '..', 'src', 'services', '__fixtures__');
  const contractPair = 'contract-pair.basic-natal.v1';
  const payload = readJson(path.join(fixturesDir, `${contractPair}.payload.json`));
  const candidate = readJson(path.join(fixturesDir, `${contractPair}.ai-candidate.json`));
  const expected = readJson(path.join(fixturesDir, `${contractPair}.normalized.json`));

  const normalized = normalizeMingSkyNarrativeOutput(candidate, payload);
  const validation = validateMingSkyNarrativeOutputShape(normalized);

  assert.strictEqual(normalized.schema_version, SCHEMA_VERSION, 'schema_version mismatch');
  assert.strictEqual(validation.ok, true, `shape validation failed: ${validation.errors.join('; ')}`);
  assert.deepStrictEqual(normalized, expected, 'normalized output drifted from expected snapshot');

  console.log(`MingSky narrative regression passed for ${contractPair}.`);
  console.log(`Sections: ${normalized.sections.length}`);
  console.log(`Title: ${normalized.title}`);
}

main();
