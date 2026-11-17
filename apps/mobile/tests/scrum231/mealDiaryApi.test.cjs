// SCRUM-231 — Meal Diary API-client tests.
// IMPORTANT: Fixture/contract must be confirmed against your team's mealDiaryApi.ts.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fakeResponse, withFetch } = require('./registerTs.cjs');
const { createMealDiaryApi } = require('../../src/screens/meal-diary/mealDiaryApi.ts');

const BASE = 'https://example.test';
const USER_ID = '9be68010-1111-4222-8333-aabbccddeeff';
const DATE = '2026-11-17';
const sampleMeal = {
  mealType: 'BREAKFAST',
  source: 'HOME',
  loggedAt: `${DATE}T08:30:00.000Z`,
  items: [{ foodName: 'Cháo gà', calories: 220, quantity: 1, unit: 'serving', protein: 15 }],
};

const oldEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
test.beforeEach(() => { delete process.env.EXPO_PUBLIC_API_BASE_URL; });
test.after(() => {
  if (oldEnv === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = oldEnv;
});

test('factory exposes Meal Diary methods used by MealDiaryScreen', () => {
  const api = createMealDiaryApi(BASE, USER_ID);
  assert.equal(typeof api.getHistory, 'function');
  assert.equal(typeof api.getCalorieGoal, 'function');
  assert.equal(typeof api.logMeal, 'function');
});

test('getHistory requests the selected date and user context', async () => {
  const history = { meals: [], dailySummary: [{ date: DATE, calories: 0, protein: 0, carbs: 0, fat: 0 }] };
  const { calls, result } = await withFetch(fakeResponse(history), () =>
    createMealDiaryApi(BASE, USER_ID).getHistory(DATE),
  );
  assert.ok(calls.length > 0, 'getHistory should call fetch');
  const historyRequest = calls.find(c => c.url.includes(DATE));
  assert.ok(historyRequest, 'at least one history request must include the selected date');
  assert.ok(historyRequest.url.startsWith(BASE));
  assert.equal(historyRequest.options.method ?? 'GET', 'GET');
  assert.equal(historyRequest.options.headers?.['X-User-Id'], USER_ID);
  assert.ok(result && Array.isArray(result.meals) && Array.isArray(result.dailySummary));
});

test('logMeal serializes mealType, source, food and calorie data', async () => {
  const { calls } = await withFetch(fakeResponse({ id: 'logged-meal-1', ...sampleMeal }, 201), () =>
    createMealDiaryApi(BASE, USER_ID).logMeal(sampleMeal),
  );
  const request = calls.find(c => c.options.method === 'POST');
  assert.ok(request, 'logMeal must issue a POST');
  assert.ok(request.url.startsWith(BASE));
  assert.equal(request.options.headers?.['X-User-Id'], USER_ID);
  const sent = JSON.parse(request.options.body);
  assert.equal(sent.mealType, sampleMeal.mealType);
  assert.equal(sent.source, sampleMeal.source);
  assert.equal(sent.items[0].foodName, sampleMeal.items[0].foodName);
  assert.equal(sent.items[0].calories, sampleMeal.items[0].calories);
});

test('getHistory surfaces an unsuccessful HTTP response', async () => {
  await withFetch(fakeResponse({ error: 'Unauthorized' }, 401), async () => {
    await assert.rejects(createMealDiaryApi(BASE, USER_ID).getHistory(DATE));
  });
});
