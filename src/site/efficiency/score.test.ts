import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cellRaw,
  parseHardware,
  pickConcurrency,
  scaledScore,
  scoreCorpus,
  type BenchRun,
} from './score.ts';
import { tcoUsdPerMTok } from './tco.ts';

test('parseHardware reads family and width', () => {
  assert.deepEqual(parseHardware('H100x4'), { family: 'H100', gpus: 4, label: 'H100x4' });
  assert.deepEqual(parseHardware('A100-40GB'), { family: 'A100', gpus: 1, label: 'A100-40GB' });
  assert.equal(parseHardware('mystery'), null);
});

test('pickConcurrency falls back inside the documented band', () => {
  assert.equal(pickConcurrency([1, 20, 80], 40), 20);
  assert.equal(pickConcurrency([1, 40, 160], 40), 40);
  assert.equal(pickConcurrency([10], 160), null);
});

test('faster decode / prefill / throughput raises cell raw', () => {
  const slow = cellRaw({ tpotMs: 40, ttftMs: 200, tokPerSec: 20 });
  const fast = cellRaw({ tpotMs: 10, ttftMs: 50, tokPerSec: 80 });
  assert.ok(fast > slow);
});

test('scaledScore maps min→1 and max→100', () => {
  assert.equal(scaledScore(10, { min: 10, max: 100 }), 1);
  assert.equal(scaledScore(100, { min: 10, max: 100 }), 100);
  const mid = scaledScore(Math.sqrt(10 * 100), { min: 10, max: 100 });
  assert.ok(Math.abs(mid - 50.5) < 1e-6);
});

test('scoreCorpus ranks the faster config higher and tags verified', () => {
  const profiles = [
    'chat-singleturn-synth',
    'chat-multiturn-synth',
    'swebench-multiturn-synth',
    'terminalbench-multiturn-synth',
    'osworld-multiturn-synth',
  ];
  const loads = [1, 40, 160];
  const mk = (model: string, tpot: number, tps: number): BenchRun[] =>
    profiles.flatMap((profile) =>
      loads.map((concurrency) => ({
        hardware: 'H100',
        modelShort: model,
        quant: 'BF16',
        engine: 'vllm',
        profile,
        concurrency,
        successRate: 1,
        tpotMs: tpot,
        ttftMs: tpot * 4,
        tokPerSec: tps,
      })),
    );
  const { rows } = scoreCorpus([...mk('fast', 10, 80), ...mk('slow', 40, 20)]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].model, 'fast');
  assert.ok(rows[0].efficiency > rows[1].efficiency);
  assert.equal(rows[0].provenance, 'verified');
  assert.equal(rows[0].raw.domainCount, 4);
  assert.ok(rows[0].raw.tcoUsdPerMTok > 0);
  assert.equal(rows[0].raw.costCells.length, 15);
  assert.equal('usdPerMTok' in rows[0].raw, false);
  assert.equal('cost' in rows[0], false);
  assert.equal(rows[0].efficiency, 100);
  assert.equal(rows[1].efficiency, 1);
  assert.ok(rows.every((r) => r.efficiency >= 1));
  assert.ok(rows[0].raw.tcoUsdPerMTok < rows[1].raw.tcoUsdPerMTok);
});

test('TCO mix weights loads and domains before freezing the row', () => {
  const profiles = [
    'chat-singleturn-synth',
    'chat-multiturn-synth',
    'swebench-multiturn-synth',
    'terminalbench-multiturn-synth',
    'osworld-multiturn-synth',
  ];
  const throughput = new Map([[1, 10], [40, 20], [160, 40]]);
  const runs: BenchRun[] = profiles.flatMap((profile) =>
    [...throughput].map(([concurrency, tokPerSec]) => ({
      hardware: '3090',
      modelShort: 'mixed',
      quant: 'BF16',
      engine: 'vllm',
      profile,
      concurrency,
      successRate: 1,
      tpotMs: 20,
      ttftMs: 80,
      tokPerSec,
    })),
  );
  const { rows } = scoreCorpus(runs);
  const costs = [10, 20, 40].map((tps) => tcoUsdPerMTok(tps, '3090', 1) as number);
  const expected = costs[0] * 0.25 + costs[1] * 0.5 + costs[2] * 0.25;
  assert.ok(Math.abs(rows[0].raw.tcoUsdPerMTok - expected) < 1e-4);
  assert.ok(Math.abs((rows[0].raw.tcoByDomain.chat ?? 0) - expected) < 1e-4);
});

test('scoreCorpus drops configs that never hit the serving-point band', () => {
  const profiles = [
    'chat-singleturn-synth',
    'chat-multiturn-synth',
    'swebench-multiturn-synth',
    'terminalbench-multiturn-synth',
    'osworld-multiturn-synth',
  ];
  const runs: BenchRun[] = profiles.flatMap((profile) =>
    [1, 200].map((concurrency) => ({
      hardware: '3090x4',
      modelShort: 'sparse',
      quant: 'BF16',
      engine: 'sglang',
      profile,
      concurrency,
      successRate: 1,
      tpotMs: 20,
      ttftMs: 80,
      tokPerSec: 30,
    })),
  );
  const { rows } = scoreCorpus(runs);
  assert.equal(rows.length, 0);
});
