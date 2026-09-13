import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildEngineIndex,
  buildHardwareIndex,
  buildModelIndex,
  configUsdPerMTok,
} from './indexes.ts';
import { MODEL_CATALOG } from './models.ts';
import type { IndexRow } from './score.ts';
import { EFFICIENCY_SNAPSHOT } from './snapshot.ts';

type RowSeed = Pick<IndexRow, 'id' | 'model' | 'hardwareFamily' | 'gpus' | 'engine'> &
  Partial<Omit<IndexRow, 'raw'>> & { raw?: Partial<IndexRow['raw']> };

function row(partial: RowSeed): IndexRow {
  const usd = partial.raw?.tcoUsdPerMTok ?? 1;
  const raw: IndexRow['raw'] = {
    tpotMs: 10,
    ttftMs: 40,
    tokPerSec: 100,
    tcoUsdPerMTok: usd,
    tcoByDomain: { chat: usd, coding: usd, terminal: usd, computerUse: usd },
    costCells: [
      {
        domain: 'coding',
        profile: 'swebench-multiturn-synth',
        targetLoad: 40,
        actualConcurrency: 40,
        tokPerSec: 100,
        tcoUsdPerMTok: usd,
      },
    ],
    loadsUsed: [40],
    domainCount: 4,
    runCount: 4,
    ...partial.raw,
  };
  return {
    id: partial.id,
    model: partial.model,
    hardwareFamily: partial.hardwareFamily,
    gpus: partial.gpus,
    engine: partial.engine,
    hardware: `${partial.hardwareFamily}x${partial.gpus}`,
    quant: 'BF16',
    provenance: 'verified',
    efficiency: 50,
    domains: { chat: 50, coding: 50, terminal: 50, computerUse: 50 },
    ...partial,
    raw,
  };
}

test('hardware index weights models and engines, not config counts', () => {
  const rows = [
    row({ id: 'a-h', model: 'A', hardwareFamily: 'H100', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 1 } }),
    row({ id: 'b-h1', model: 'B', hardwareFamily: 'H100', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 3 } }),
    row({ id: 'b-h2', model: 'B', hardwareFamily: 'H100', gpus: 1, engine: 'sglang', raw: { tcoUsdPerMTok: 3 } }),
    row({ id: 'a-a', model: 'A', hardwareFamily: 'A100', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 4 } }),
  ];
  const hw = buildHardwareIndex(rows);
  const h100 = hw.find((r) => r.family === 'H100');
  assert.ok(h100);
  assert.equal(h100.nModels, 2);
  assert.equal(h100.nConfigs, 3);
  assert.equal(h100.usdPerMTok, 2);
  assert.equal(configUsdPerMTok(rows[0]), 1);
});

test('stored TCO remains comparable across measured GPU widths', () => {
  const rows = [
    row({ id: '1', model: 'M', hardwareFamily: '3090', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 0.5 } }),
    row({ id: '4', model: 'N', hardwareFamily: '3090', gpus: 4, engine: 'vllm', raw: { tcoUsdPerMTok: 0.5 } }),
  ];
  const hw = buildHardwareIndex(rows);
  assert.equal(hw[0].minGpus, 1);
  assert.equal(hw[0].maxGpus, 4);
  assert.equal(hw[0].usdPerMTok, 0.5);
});

test('matched observations produce vs-H100 ratio', () => {
  const rows = [
    row({ id: 'h', model: 'M', hardwareFamily: 'H100', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 2 } }),
    row({ id: 'c', model: 'M', hardwareFamily: '2080 Ti', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 1 } }),
  ];
  const hw = buildHardwareIndex(rows, { minMatchedModels: 1 });
  assert.equal(hw[0].family, '2080 Ti');
  assert.equal(hw[0].score, 100);
  const h100 = hw.find((r) => r.family === 'H100');
  assert.equal(h100?.vsH100, 1);
  assert.equal(hw[0].vsH100, 2);
  assert.equal(hw[0].nMatchedModels, 1);
});

test('thin matched coverage suppresses relative claim', () => {
  const rows = [
    row({ id: 'h', model: 'M', hardwareFamily: 'H100', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 2 } }),
    row({ id: 'c', model: 'M', hardwareFamily: '2080 Ti', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 1 } }),
  ];
  const card = buildHardwareIndex(rows).find((r) => r.family === '2080 Ti');
  assert.equal(card?.vsH100, null);
  assert.equal(card?.thinCoverage, true);
});

test('engine index uses only model-family pairs shared by all engines', () => {
  const rows = [
    row({ id: 'v-h1', model: 'M', hardwareFamily: 'H100', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 1 } }),
    row({ id: 'v-extra', model: 'N', hardwareFamily: 'H100', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 100 } }),
    row({ id: 'v-a', model: 'M', hardwareFamily: 'A100', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 3 } }),
    row({ id: 's-h', model: 'M', hardwareFamily: 'H100', gpus: 1, engine: 'sglang', raw: { tcoUsdPerMTok: 2 } }),
    row({ id: 's-a', model: 'M', hardwareFamily: 'A100', gpus: 1, engine: 'sglang', raw: { tcoUsdPerMTok: 4 } }),
  ];
  const en = buildEngineIndex(rows);
  assert.equal(en.length, 2);
  assert.equal(en.find((r) => r.engine === 'vllm')?.usdPerMTok, 2);
  assert.equal(en.find((r) => r.engine === 'sglang')?.usdPerMTok, 3);
  assert.equal(en.find((r) => r.engine === 'vllm')?.nConfigs, 2);
  assert.equal(en.find((r) => r.engine === 'sglang')?.nConfigs, 2);
  assert.equal(en[0].nMatchedPairs, 2);
});

test('selected-model option filters hardware and engine reductions', () => {
  const rows = [
    row({ id: 'a-h', model: 'A', hardwareFamily: 'H100', gpus: 1, engine: 'vllm' }),
    row({ id: 'b-a', model: 'B', hardwareFamily: 'A100', gpus: 1, engine: 'vllm' }),
  ];
  assert.deepEqual(buildHardwareIndex(rows, { model: 'A' }).map((r) => r.family), ['H100']);
  assert.equal(buildEngineIndex(rows, { model: 'B' })[0].nModels, 1);
});

test('experimental model index is isolated from hardware measurements', () => {
  const rows = [
    row({ id: 'small', model: 'Llama-3.1-8B', hardwareFamily: 'H100', gpus: 1, engine: 'vllm' }),
    row({ id: 'big', model: 'Llama-3.3-70B', hardwareFamily: 'H100', gpus: 1, engine: 'vllm' }),
  ];
  const index = buildModelIndex(rows);
  assert.equal(index[0].model, 'Llama-3.1-8B');
  assert.ok(index[0].intelPerGflop > index[1].intelPerGflop);
  assert.ok(index[1].intelligence > index[0].intelligence);
});

test('catalog covers every frozen snapshot model', () => {
  const snapshotModels = new Set(EFFICIENCY_SNAPSHOT.rows.map((r) => r.model));
  const catalogModels = new Set(MODEL_CATALOG.map((r) => r.model));
  assert.deepEqual([...snapshotModels].filter((model) => !catalogModels.has(model)), []);
});
