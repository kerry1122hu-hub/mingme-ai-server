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
  const payload = readJson(path.join(fixturesDir, 'mingskyNarrative.payload.sample.json'));
  const candidate = readJson(path.join(fixturesDir, 'mingskyNarrative.ai-candidate.sample.json'));
  const expected = readJson(path.join(fixturesDir, 'mingskyNarrative.expected-output.sample.json'));

  const normalized = normalizeMingSkyNarrativeOutput(candidate, payload);
  const validation = validateMingSkyNarrativeOutputShape(normalized);

  assert.strictEqual(normalized.schema_version, SCHEMA_VERSION, 'schema_version mismatch');
  assert.strictEqual(validation.ok, true, `shape validation failed: ${validation.errors.join('; ')}`);
  assert.deepStrictEqual(normalized, expected, 'normalized output drifted from expected snapshot');

  console.log('MingSky narrative regression passed.');
  console.log(`Sections: ${normalized.sections.length}`);
  console.log(`Title: ${normalized.title}`);
}

main();
