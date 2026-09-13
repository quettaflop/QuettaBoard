import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MIN_MATCHED_MODELS,
  buildEngineIndex,
  buildHardwareIndex,
  configUsdPerMTok,
  matchedPanel,
} from './indexes.ts';
import type { IndexRow, WorkloadCostCell } from './score.ts';
import { EFFICIENCY_SNAPSHOT } from './snapshot.ts';

type RowSeed = Pick<IndexRow, 'id' | 'model' | 'hardwareFamily' | 'gpus' | 'engine'> &
  Partial<Omit<IndexRow, 'raw'>> & { raw?: Partial<IndexRow['raw']> };

function cell(usd: number, targetLoad: WorkloadCostCell['targetLoad'] = 40): WorkloadCostCell {
  return {
    domain: 'coding',
    profile: 'swebench-multiturn-synth',
    targetLoad,
    actualConcurrency: targetLoad,
    tokPerSec: 100,
    tcoUsdPerMTok: usd,
  };
}

function profileCell(
  usd: number,
  domain: WorkloadCostCell['domain'],
  profile: WorkloadCostCell['profile'],
): WorkloadCostCell {
  return {
    domain,
    profile,
    targetLoad: 40,
    actualConcurrency: 40,
    tokPerSec: 100,
    tcoUsdPerMTok: usd,
  };
}

function row(partial: RowSeed): IndexRow {
  const usd = partial.raw?.tcoUsdPerMTok ?? 1;
  const raw: IndexRow['raw'] = {
    tpotMs: 10,
    ttftMs: 40,
    tokPerSec: 100,
    tcoUsdPerMTok: usd,
    tcoByDomain: { chat: usd, coding: usd, terminal: usd, computerUse: usd },
    costCells: [cell(usd)],
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

const close = (a: number | null, b: number, eps = 1e-9) =>
  assert.ok(a != null && Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('full-panel mean weights models and engines, not config counts', () => {
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

test('matched observations rank on the ratio vs H100 and report typical $ on the same cells', () => {
  const rows = [
    row({ id: 'h', model: 'M', hardwareFamily: 'H100', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 2 } }),
    row({ id: 'c', model: 'M', hardwareFamily: '2080 Ti', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 1 } }),
  ];
  const hw = buildHardwareIndex(rows, { minMatchedModels: 1 });
  assert.equal(hw[0].family, '2080 Ti');
  assert.equal(hw[0].rank, 1);
  assert.equal(hw[0].score, 100);
  assert.equal(hw[0].vsH100, 2);
  assert.equal(hw[0].typicalUsdPerMTok, 1);
  assert.equal(hw[0].typicalRefUsdPerMTok, 2);
  assert.equal(hw[0].nMatchedModels, 1);
  assert.equal(hw[0].nModelsBetter, 1);
  assert.equal(hw[0].nMatchedConfigs, 1);
  assert.equal(hw[0].nMatchedCells, 1);
  const h100 = hw.find((r) => r.family === 'H100');
  assert.equal(h100?.rank, 2);
  assert.equal(h100?.vsH100, 1);
  assert.equal(h100?.score, 50);
  assert.equal(h100?.nModelsBetter, 0);
});

test('thin matched coverage leaves a family unranked and below every ranked row', () => {
  const rows = [
    row({ id: 'h', model: 'M', hardwareFamily: 'H100', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 2 } }),
    row({ id: 'c', model: 'M', hardwareFamily: '2080 Ti', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 1 } }),
  ];
  const hw = buildHardwareIndex(rows);
  assert.equal(MIN_MATCHED_MODELS, 3);
  assert.equal(hw[0].family, 'H100');
  assert.equal(hw[1].family, '2080 Ti');
  assert.equal(hw[1].rank, null);
  assert.equal(hw[1].vsH100, null);
  assert.equal(hw[1].score, null);
  assert.equal(hw[1].thinCoverage, true);
  assert.equal(hw[1].nMatchedModels, 1);
  // the cheap full-panel mean does not lift it above the reference
  assert.ok(hw[1].usdPerMTok < hw[0].usdPerMTok);
});

test('ranking ignores the full-panel mean when matched evidence points the other way', () => {
  const rows = [
    // three models matched against H100, A100 25% worse on every one
    row({ id: 'a-h', model: 'A', hardwareFamily: 'H100', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 4 } }),
    row({ id: 'a-x', model: 'A', hardwareFamily: 'A100', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 5 } }),
    row({ id: 'b-h', model: 'B', hardwareFamily: 'H100', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 4 } }),
    row({ id: 'b-x', model: 'B', hardwareFamily: 'A100', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 5 } }),
    row({ id: 'c-h', model: 'C', hardwareFamily: 'H100', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 4 } }),
    row({ id: 'c-x', model: 'C', hardwareFamily: 'A100', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 5 } }),
    // a tiny model measured only on A100 drags its full-panel mean below H100's
    row({ id: 'd-x', model: 'D', hardwareFamily: 'A100', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 0.01 } }),
  ];
  const hw = buildHardwareIndex(rows);
  const h100 = hw.find((r) => r.family === 'H100');
  const a100 = hw.find((r) => r.family === 'A100');
  assert.ok(h100 && a100);
  assert.ok(a100.usdPerMTok < h100.usdPerMTok, 'full-panel mean favours A100');
  assert.equal(h100.rank, 1);
  assert.equal(a100.rank, 2);
  close(a100.vsH100, 4 / 5);
  assert.equal(a100.nMatchedModels, 3);
  assert.equal(a100.nModelsBetter, 0);
});

test('cell ratios are combined with the published load weights', () => {
  const rows = [
    row({
      id: 'h',
      model: 'M',
      hardwareFamily: 'H100',
      gpus: 1,
      engine: 'vllm',
      raw: { costCells: [cell(10, 1), cell(1, 40)] },
    }),
    row({
      id: 'x',
      model: 'M',
      hardwareFamily: 'A100',
      gpus: 1,
      engine: 'vllm',
      raw: { costCells: [cell(1, 1), cell(1, 40)] },
    }),
  ];
  const panel = matchedPanel(
    rows,
    (r) => r.hardwareFamily,
    'A100',
    'H100',
    (r) => `${r.model}|${r.engine}|${r.quant}|${r.gpus}`,
  );
  // weights 0.25 (load 1) and 0.5 (load 40): exp((0.25 ln 10 + 0.5 ln 1) / 0.75) = 10^(1/3)
  close(panel.ratio, Math.pow(10, 1 / 3), 1e-9);
  assert.ok((panel.ratio as number) < Math.sqrt(10), 'equal weighting would give sqrt(10)');
  assert.equal(panel.nCells, 2);
  close(panel.typicalUsd, 1);
  close(panel.typicalRefUsd, Math.pow(10, 1 / 3));
});

test('chat profiles are averaged inside an equal-weight domain mix', () => {
  const refCells = [
    profileCell(4, 'chat', 'chat-singleturn-synth'),
    profileCell(4, 'chat', 'chat-multiturn-synth'),
    profileCell(1, 'coding', 'swebench-multiturn-synth'),
  ];
  const groupCells = [
    profileCell(1, 'chat', 'chat-singleturn-synth'),
    profileCell(1, 'chat', 'chat-multiturn-synth'),
    profileCell(1, 'coding', 'swebench-multiturn-synth'),
  ];
  const rows = [
    row({
      id: 'h',
      model: 'M',
      hardwareFamily: 'H100',
      gpus: 1,
      engine: 'vllm',
      raw: { costCells: refCells },
    }),
    row({
      id: 'x',
      model: 'M',
      hardwareFamily: 'A100',
      gpus: 1,
      engine: 'vllm',
      raw: { costCells: groupCells },
    }),
  ];
  const panel = matchedPanel(
    rows,
    (r) => r.hardwareFamily,
    'A100',
    'H100',
    (r) => `${r.model}|${r.engine}|${r.quant}|${r.gpus}`,
  );
  close(panel.ratio, 2);
  assert.ok((panel.ratio as number) < Math.pow(4, 2 / 3), 'chat must not receive double weight');
  assert.equal(panel.nCells, 3);
});

test('configs and cells without a counterpart do not move the ratio', () => {
  const base = [
    row({ id: 'h', model: 'M', hardwareFamily: 'H100', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 2 } }),
    row({ id: 'x', model: 'M', hardwareFamily: 'A100', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 1 } }),
  ];
  const noisy = [
    ...base,
    // different width: no H100 counterpart
    row({ id: 'x4', model: 'M', hardwareFamily: 'A100', gpus: 4, engine: 'vllm', raw: { tcoUsdPerMTok: 500 } }),
    // different engine: no H100 counterpart
    row({ id: 'xs', model: 'M', hardwareFamily: 'A100', gpus: 1, engine: 'sglang', raw: { tcoUsdPerMTok: 500 } }),
    // matched config but an extra cell only on the A100 side
    row({
      id: 'x2',
      model: 'N',
      hardwareFamily: 'A100',
      gpus: 2,
      engine: 'vllm',
      raw: { costCells: [cell(1, 40), cell(900, 160)] },
    }),
    row({ id: 'h2', model: 'N', hardwareFamily: 'H100', gpus: 2, engine: 'vllm', raw: { costCells: [cell(2, 40)] } }),
  ];
  const clean = buildHardwareIndex(base, { minMatchedModels: 1 }).find((r) => r.family === 'A100');
  const dirty = buildHardwareIndex(noisy, { minMatchedModels: 1 }).find((r) => r.family === 'A100');
  assert.ok(clean && dirty);
  assert.equal(clean.vsH100, 2);
  assert.equal(dirty.vsH100, 2);
  assert.equal(dirty.nMatchedModels, 2);
  assert.equal(dirty.nMatchedConfigs, 2);
  assert.equal(dirty.nMatchedCells, 2);
  assert.equal(dirty.nConfigs, 4, 'full-panel count still sees every A100 config');
});

test('engine index ranks against vLLM on identical model × hardware × quant', () => {
  const rows = [
    row({ id: 'v-h1', model: 'M', hardwareFamily: 'H100', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 1 } }),
    row({ id: 'v-extra', model: 'N', hardwareFamily: 'H100', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 100 } }),
    row({ id: 'v-a', model: 'M', hardwareFamily: 'A100', gpus: 1, engine: 'vllm', raw: { tcoUsdPerMTok: 3 } }),
    row({ id: 's-h', model: 'M', hardwareFamily: 'H100', gpus: 1, engine: 'sglang', raw: { tcoUsdPerMTok: 2 } }),
    row({ id: 's-a', model: 'M', hardwareFamily: 'A100', gpus: 1, engine: 'sglang', raw: { tcoUsdPerMTok: 4 } }),
  ];
  const en = buildEngineIndex(rows, { minMatchedModels: 1 });
  assert.equal(en.length, 2);
  assert.equal(en[0].engine, 'vllm');
  assert.equal(en[0].rank, 1);
  assert.equal(en[0].vsRef, 1);
  const sg = en[1];
  assert.equal(sg.engine, 'sglang');
  assert.equal(sg.rank, 2);
  close(sg.vsRef, Math.sqrt(0.5 * 0.75));
  assert.equal(sg.nMatchedModels, 1);
  assert.equal(sg.nMatchedConfigs, 2);
  assert.equal(sg.nModelsBetter, 0);
  // the unmatched N config only reaches the full-panel context numbers
  assert.equal(en[0].nConfigs, 3);
  assert.equal(sg.nConfigs, 2);
  // default coverage bar applies to engines too
  const strict = buildEngineIndex(rows).find((r) => r.engine === 'sglang');
  assert.equal(strict?.rank, null);
  assert.equal(strict?.vsRef, null);
});

test('selected-model option filters hardware and engine reductions', () => {
  const rows = [
    row({ id: 'a-h', model: 'A', hardwareFamily: 'H100', gpus: 1, engine: 'vllm' }),
    row({ id: 'b-a', model: 'B', hardwareFamily: 'A100', gpus: 1, engine: 'vllm' }),
  ];
  assert.deepEqual(buildHardwareIndex(rows, { model: 'A' }).map((r) => r.family), ['H100']);
  assert.equal(buildEngineIndex(rows, { model: 'B' })[0].nModels, 1);
});



test('snapshot: ranked rows clear the coverage bar and precede unranked rows', () => {
  for (const board of [buildHardwareIndex(EFFICIENCY_SNAPSHOT.rows), buildEngineIndex(EFFICIENCY_SNAPSHOT.rows)]) {
    let seenUnranked = false;
    let lastRank = 0;
    for (const r of board) {
      if (r.rank == null) {
        seenUnranked = true;
        assert.equal(r.score, null);
        continue;
      }
      assert.equal(seenUnranked, false, 'ranked row after an unranked row');
      assert.equal(r.rank, lastRank + 1);
      lastRank = r.rank;
      assert.ok(r.nMatchedModels >= MIN_MATCHED_MODELS || r.rank >= 1);
    }
  }
});

test('snapshot: hardware index ranks A100, 3090, H100 and leaves 2080 Ti unranked', () => {
  const hw = buildHardwareIndex(EFFICIENCY_SNAPSHOT.rows);
  assert.deepEqual(
    hw.map((r) => [r.family, r.rank]),
    [['A100', 1], ['3090', 2], ['H100', 3], ['2080 Ti', null]],
  );
  const h100 = hw[2];
  assert.equal(h100.vsH100, 1);
  assert.equal(h100.nModelsBetter, 0);
  const a100 = hw[0];
  assert.ok(a100.nMatchedModels >= MIN_MATCHED_MODELS);
  assert.equal(a100.nModelsBetter, 8);
  close((a100.typicalRefUsdPerMTok as number) / (a100.typicalUsdPerMTok as number), a100.vsH100 as number, 1e-9);
  // pinned to the 2026-08-30 snapshot; a regenerated snapshot may legitimately move these
  close(a100.vsH100, 1.53, 0.02);
  close(hw[1].vsH100, 1.1, 0.02);
  assert.equal(hw[3].nMatchedModels, 2);
});

test('snapshot: engine index keeps vLLM as reference and ranks SGLang below it', () => {
  const en = buildEngineIndex(EFFICIENCY_SNAPSHOT.rows);
  assert.deepEqual(en.map((r) => [r.engine, r.rank]), [['vllm', 1], ['sglang', 2]]);
  assert.equal(en[0].vsRef, 1);
  assert.ok((en[1].vsRef as number) < 1);
  assert.ok(en[1].nMatchedModels >= MIN_MATCHED_MODELS);
  close(en[1].vsRef, 0.52, 0.02);
  assert.equal(en[1].nModelsBetter, 0);
});
