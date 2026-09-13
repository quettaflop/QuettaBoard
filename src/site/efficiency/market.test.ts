import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OPENROUTER_LLAMA31_8B, selfHostedToApiRatio } from './market.ts';

test('OpenRouter reference is dated, scoped and internally consistent', () => {
  assert.match(OPENROUTER_LLAMA31_8B.asOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(OPENROUTER_LLAMA31_8B.endpointCount, OPENROUTER_LLAMA31_8B.endpoints.length);
  assert.ok(OPENROUTER_LLAMA31_8B.usdPerMTokIn.min > 0);
  assert.ok(
    OPENROUTER_LLAMA31_8B.usdPerMTokOut.min <=
      OPENROUTER_LLAMA31_8B.usdPerMTokOut.median,
  );
  assert.ok(
    OPENROUTER_LLAMA31_8B.usdPerMTokOut.median <=
      OPENROUTER_LLAMA31_8B.usdPerMTokOut.max,
  );
  assert.deepEqual(
    OPENROUTER_LLAMA31_8B.endpoints.map((endpoint) => endpoint.provider).sort(),
    ['Cloudflare', 'CoreWeave', 'DeepInfra', 'Groq', 'Novita'].sort(),
  );
  assert.ok(OPENROUTER_LLAMA31_8B.href.startsWith('https://openrouter.ai/'));
  assert.ok(OPENROUTER_LLAMA31_8B.href.endsWith(OPENROUTER_LLAMA31_8B.slug));
  assert.ok(OPENROUTER_LLAMA31_8B.scope.length > 0);
});

test('self-hosted ÷ API ratio', () => {
  assert.ok(Math.abs((selfHostedToApiRatio(0.29, 0.08) ?? 0) - 3.625) < 1e-12);
  assert.equal(selfHostedToApiRatio(0.29, 0), null);
  assert.equal(selfHostedToApiRatio(0, 0.08), null);
});
