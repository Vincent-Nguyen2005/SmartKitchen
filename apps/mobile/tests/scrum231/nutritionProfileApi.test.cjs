// SCRUM-231 — Nutrition API client unit tests; also guards SCRUM-270 regression.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fakeResponse, withFetch } = require('./registerTs.cjs');
const {
  createNutritionProfileApi,
  createHealthPreferencesApi,
  NutritionApiError,
} = require('../../src/screens/nutrition/nutritionProfileApi.ts');

const BASE = 'https://example.test';
const USER_ID = '9be68010-1111-4222-8333-aabbccddeeff';
const TOKEN = 'example-access-token';
const PROFILE_INPUT = {
  height: 175,
  weight: 68,
  birthYear: 2001,
  gender: 'MALE',
  activityLevel: 'MODERATELY_ACTIVE',
};
const PROFILE_RESULT = {
  profile: {
    ...PROFILE_INPUT,
    id: '4be68010-1111-4222-8333-aabbccddeeff',
    userId: USER_ID,
    createdAt: '2026-11-17T00:00:00.000Z',
    updatedAt: '2026-11-17T00:00:00.000Z',
  },
  bmr: 1600,
  tdee: 2400,
};

const oldEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
test.beforeEach(() => { delete process.env.EXPO_PUBLIC_API_BASE_URL; });
test.after(() => {
  if (oldEnv === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = oldEnv;
});

function expectedHeaders(options) {
  assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(options.headers['X-User-Id'], USER_ID);
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.ok(options.headers['ngrok-skip-browser-warning']);
}

test('GET profile: correct /api/nutrition-profile route and authorization headers', async () => {
  const { calls, result } = await withFetch(fakeResponse(PROFILE_RESULT), () =>
    createNutritionProfileApi(`${BASE}/`, TOKEN, USER_ID).get(),
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BASE}/api/nutrition-profile`);
  assert.equal(calls[0].options.method, 'GET');
  expectedHeaders(calls[0].options);
  assert.deepEqual(result, PROFILE_RESULT);
});

test('POST creates profile with the complete JSON payload', async () => {
  const { calls } = await withFetch(fakeResponse(PROFILE_RESULT, 201), () =>
    createNutritionProfileApi(BASE, TOKEN, USER_ID).create(PROFILE_INPUT),
  );
  assert.equal(calls[0].url, `${BASE}/api/nutrition-profile`);
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), PROFILE_INPUT);
  expectedHeaders(calls[0].options);
});

test('PUT updates an existing profile', async () => {
  const changes = { ...PROFILE_INPUT, weight: 70 };
  const { calls } = await withFetch(fakeResponse(PROFILE_RESULT), () =>
    createNutritionProfileApi(BASE, TOKEN, USER_ID).update(changes),
  );
  assert.equal(calls[0].options.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0].options.body), changes);
  expectedHeaders(calls[0].options);
});

test('supports UUID read from the session JWT if no third argument is supplied', async () => {
  const payload = Buffer.from(JSON.stringify({ sub: USER_ID })).toString('base64url');
  const token = `eyJhbGciOiJub25lIn0.${payload}.signature`;
  const { calls } = await withFetch(fakeResponse(PROFILE_RESULT), () =>
    createNutritionProfileApi(BASE, token).get(),
  );
  assert.equal(calls[0].options.headers['X-User-Id'], USER_ID);
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${token}`);
});

test('missing/invalid user ID rejects before sending a request', async () => {
  const { calls } = await withFetch(fakeResponse(PROFILE_RESULT), async () => {
    await assert.rejects(
      createNutritionProfileApi(BASE, TOKEN).get(),
      /UUID|User ID/i,
    );
  });
  assert.equal(calls.length, 0);
});

test('missing access token is rejected', async () => {
  await assert.rejects(createNutritionProfileApi(BASE, ' ', USER_ID).get(), /access token/i);
});

test('HTTP 404 exposes typed error and backend message', async () => {
  const { calls } = await withFetch(fakeResponse({ error: 'Profile not found' }, 404), async () => {
    await assert.rejects(
      createNutritionProfileApi(BASE, TOKEN, USER_ID).get(),
      (error) => error instanceof NutritionApiError && error.status === 404 && error.message === 'Profile not found',
    );
  });
  assert.equal(calls.length, 1);
});

test('empty successful response is handled as an error', async () => {
  await withFetch(fakeResponse(undefined), async () => {
    await assert.rejects(createNutritionProfileApi(BASE, TOKEN, USER_ID).get(), /invalid response/i);
  });
});

test('EXPO_PUBLIC_API_BASE_URL takes priority over the fallback', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://configured.test///';
  const { calls } = await withFetch(fakeResponse(PROFILE_RESULT), () =>
    createNutritionProfileApi(BASE, TOKEN, USER_ID).get(),
  );
  assert.equal(calls[0].url, 'https://configured.test/api/nutrition-profile');
});

test('Health Preferences routes stay under /api/nutrition (SCRUM-270 regression)', async () => {
  const { calls } = await withFetch(fakeResponse([]), () =>
    createHealthPreferencesApi(BASE, TOKEN).getAllergies(),
  );
  assert.equal(calls[0].url, `${BASE}/api/nutrition/allergies`);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${TOKEN}`);
});

test('Health Preferences saves selected allergy/condition IDs', async () => {
  const selection = { allergies: [], healthConditions: [] };
  const { calls } = await withFetch(fakeResponse(selection), () =>
    createHealthPreferencesApi(BASE, TOKEN).saveSelection(['a1'], ['c1']),
  );
  assert.equal(calls[0].url, `${BASE}/api/nutrition/user/profile/health`);
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), { allergyIds: ['a1'], conditionIds: ['c1'] });
});
