import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AVG_USD_PER_KWH,
  HARDWARE_PURCHASE,
  TCO_HORIZON_YEARS,
  TCO_HOURS,
  TCO_PUE,
  TCO_UTILIZATION,
  amortSchedule,
  gpuTco,
  tcoUsdPerMTok,
} from './tco.ts';

test('electricity is the DumpsterCluster Table 4 average', () => {
  assert.ok(Math.abs(AVG_USD_PER_KWH - (0.0556 + 0.12 + 0.125) / 3) < 1e-12);
});

test('3-year schedule books purchase down to the residual', () => {
  const t = gpuTco('H100');
  const sched = amortSchedule('H100');
  assert.equal(sched.length, TCO_HORIZON_YEARS);
  assert.equal(sched[0].bookStart, HARDWARE_PURCHASE.H100.usd);
  assert.ok(Math.abs(sched[2].bookEnd - t.residualUsd) < 1e-6);
  assert.ok(Math.abs(t.amortUsd + t.residualUsd - t.purchaseUsd) < 1e-6);
});

test('TCO hour is capex amort + board electricity', () => {
  const t = gpuTco('3090');
  const spec = HARDWARE_PURCHASE['3090'];
  const elecHour = (spec.tdpW / 1000) * AVG_USD_PER_KWH;
  const amortHour = (spec.usd * (1 - spec.residualFrac)) / TCO_HOURS;
  assert.ok(Math.abs(t.usdPerHour - (elecHour + amortHour)) < 1e-9);
  assert.equal(t.utilization, TCO_UTILIZATION);
  assert.equal(t.pue, TCO_PUE);
});

test('more GPUs or fewer tok/s raises $/MTok', () => {
  const one = tcoUsdPerMTok(100, 'H100', 1);
  const four = tcoUsdPerMTok(100, 'H100', 4);
  const faster = tcoUsdPerMTok(400, 'H100', 1);
  assert.ok(one != null && four != null && faster != null);
  assert.ok(four > one);
  assert.ok(Math.abs(faster - one / 4) < 1e-9);
});

test('price assumptions are dated and scoped', () => {
  for (const spec of Object.values(HARDWARE_PURCHASE)) {
    assert.match(spec.asOf, /^\d{4}-\d{2}$/);
    assert.ok(spec.basis.length > 0);
    assert.ok(spec.href.startsWith('https://'));
  }
});
