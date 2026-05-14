const Stripe = require('stripe')

const key = process.env.STRIPE_SECRET_KEY
const hasStripeEnv = Boolean(key && key.startsWith('sk_'))

if (!hasStripeEnv) {
  console.warn('[stripe] STRIPE_SECRET_KEY missing or invalid - billing routes will be unavailable')
}

const stripe = hasStripeEnv ? new Stripe(key) : null

module.exports = { stripe, hasStripeEnv }
