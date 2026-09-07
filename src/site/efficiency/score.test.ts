import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cellRaw,
  parseHardware,
  pickConcurrency,
  scaledScore,
  scoreCorpus,
  usdPerMTok,
  type BenchRun,
} from './score.ts';

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

test('scaledScore maps p10→0 and max→100', () => {
  assert.equal(scaledScore(10, { p10: 10, p90: 50, max: 100 }), 0);
  assert.equal(scaledScore(100, { p10: 10, p90: 50, max: 100 }), 100);
  const mid = scaledScore(Math.sqrt(10 * 100), { p10: 10, p90: 50, max: 100 });
  assert.ok(Math.abs(mid - 50) < 1e-6);
});

test('usd/MTok scales with GPU count and tok/s', () => {
  const one = usdPerMTok(100, 'H100', 1);
  const four = usdPerMTok(100, 'H100', 4);
  const faster = usdPerMTok(400, 'H100', 1);
  assert.ok(one != null && four != null && faster != null);
  assert.ok(four > one);
  assert.ok(Math.abs(faster - one / 4) < 1e-9);
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
  assert.ok(rows[0].cost != null);
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
