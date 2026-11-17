// SCRUM-231 — Personalized Suggestions API contract (based on SuggestionsScreen).
// Provisional until suggestionsApi.ts is supplied and this suite is run.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fakeResponse, withFetch } = require('./registerTs.cjs');
const { createSuggestionsApi } = require('../../src/screens/nutrition/suggestionsApi.ts');

const BASE = 'https://example.test';
const USER_ID = '9be68010-1111-4222-8333-aabbccddeeff';
const suggestions = {
  targetPerMeal: { calories: 550, protein: 28, carbs: 69, fat: 18 },
  suggestions: [],
};

test('suggestions API returns targets and recipe list', async () => {
  const { calls, result } = await withFetch(fakeResponse(suggestions), () =>
    createSuggestionsApi(BASE, USER_ID).get(),
  );
  assert.ok(calls.length > 0);
  assert.ok(calls.every(call => call.url.startsWith(BASE)));
  assert.ok(Array.isArray(result?.suggestions));
  assert.equal(typeof result?.targetPerMeal?.calories, 'number');
});

test('suggestions API propagates an unsuccessful HTTP response', async () => {
  await withFetch(fakeResponse({ error: 'Nutrition profile required' }, 404), async () => {
    await assert.rejects(createSuggestionsApi(BASE, USER_ID).get());
  });
});
