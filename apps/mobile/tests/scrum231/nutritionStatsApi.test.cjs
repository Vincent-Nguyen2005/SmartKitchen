// SCRUM-231 — Nutrition Stats (API contract based on NutritionStatsScreen).
// Provisional until nutritionStatsApi.ts is supplied and this suite is run.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fakeResponse, withFetch } = require('./registerTs.cjs');
const { createNutritionStatsApi } = require('../../src/screens/nutrition/nutritionStatsApi.ts');

const BASE = 'https://example.test';
const USER_ID = '9be68010-1111-4222-8333-aabbccddeeff';
const DATE = '2026-11-17';
const stats = {
  date: DATE,
  totalCalories: 1200, totalProtein: 60, totalCarbs: 130, totalFat: 40,
  targets: { calories: 2200, protein: 110, carbs: 275, fat: 73 },
  completionPercent: { calories: 55, protein: 55, carbs: 47, fat: 55 },
};

test('getDailyStats loads a date using the expected API shape', async () => {
  const { calls, result } = await withFetch(fakeResponse(stats), () =>
    createNutritionStatsApi(BASE, USER_ID).getDailyStats(DATE),
  );
  assert.ok(calls.length > 0);
  assert.ok(calls.some(call => call.url.includes(DATE)), 'request must include the selected date');
  assert.ok(calls.every(call => call.url.startsWith(BASE)));
  assert.equal(typeof result?.totalCalories, 'number');
  assert.ok(result?.targets && result?.completionPercent);
});

test('getDailyStats propagates an HTTP failure', async () => {
  await withFetch(fakeResponse({ error: 'Profile not found' }, 404), async () => {
    await assert.rejects(createNutritionStatsApi(BASE, USER_ID).getDailyStats(DATE));
  });
});
