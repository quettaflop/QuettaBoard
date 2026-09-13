import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AA_RETRIEVED, MODEL_CATALOG, MODEL_CATALOG_BY_NAME } from './models.ts';
import { EFFICIENCY_SNAPSHOT } from './snapshot.ts';

test('every catalog model is a measured snapshot model with a dated AA variant', () => {
  assert.match(AA_RETRIEVED, /^\d{4}-\d{2}-\d{2}$/);
  const snapshotModels = new Set(EFFICIENCY_SNAPSHOT.rows.map((r) => r.model));
  for (const entry of MODEL_CATALOG) {
    assert.ok(snapshotModels.has(entry.model), `${entry.model} not in snapshot`);
    assert.ok(entry.intelligence > 0);
    assert.ok(entry.activeParamsB > 0 && entry.activeParamsB <= entry.totalParamsB);
    assert.ok(entry.variant.length > 0);
    assert.ok(entry.href.startsWith('https://artificialanalysis.ai/models/'));
  }
  assert.equal(MODEL_CATALOG_BY_NAME.size, MODEL_CATALOG.length, 'model names are unique');
});
