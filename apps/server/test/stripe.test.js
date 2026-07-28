// test/stripe.test.js — tests for stripe.js's conditional client
// initialization. This module's only real logic is "does a usable-looking
// secret key exist in the environment", so these tests exercise that
// decision directly rather than mocking the Stripe SDK itself.
//
// Because the check runs at module-load time from process.env, each test
// sets env vars and then requires a fresh copy of the module (clearing
// Node's require cache first) rather than importing it once at the top.
// Uses Node's built-in test runner — no extra dependency needed.

const test = require('node:test')
const assert = require('node:assert/strict')

const STRIPE_MODULE_PATH = require.resolve('../src/stripe')

function loadStripeModule(envKey) {
  delete require.cache[STRIPE_MODULE_PATH]
  const prev = process.env.STRIPE_SECRET_KEY
  if (envKey === undefined) delete process.env.STRIPE_SECRET_KEY
  else process.env.STRIPE_SECRET_KEY = envKey
  const mod = require('../src/stripe')
  if (prev === undefined) delete process.env.STRIPE_SECRET_KEY
  else process.env.STRIPE_SECRET_KEY = prev
  delete require.cache[STRIPE_MODULE_PATH]
  return mod
}

test('stripe: no STRIPE_SECRET_KEY set → client is null, hasStripeEnv is false', () => {
  const { stripe, hasStripeEnv } = loadStripeModule(undefined)
  assert.equal(stripe, null)
  assert.equal(hasStripeEnv, false)
})

test('stripe: empty-string STRIPE_SECRET_KEY → client is null, hasStripeEnv is false', () => {
  const { stripe, hasStripeEnv } = loadStripeModule('')
  assert.equal(stripe, null)
  assert.equal(hasStripeEnv, false)
})

test("stripe: a key that doesn't start with sk_ (e.g. a publishable pk_ key pasted by mistake) is rejected", () => {
  const { stripe, hasStripeEnv } = loadStripeModule('pk_test_thisisnotasecretkey')
  assert.equal(stripe, null)
  assert.equal(hasStripeEnv, false)
})

test('stripe: a well-formed-looking sk_ key initializes a client and hasStripeEnv is true', () => {
  const { stripe, hasStripeEnv } = loadStripeModule('sk_test_51ThisLooksLikeAValidTestKey00000000000000')
  assert.equal(hasStripeEnv, true)
  assert.notEqual(stripe, null)
})

test('stripe: hasStripeEnv strictly requires the sk_ prefix, not just any truthy string', () => {
  const { hasStripeEnv } = loadStripeModule('not-even-key-shaped')
  assert.equal(hasStripeEnv, false)
})
