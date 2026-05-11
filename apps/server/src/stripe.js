const Stripe = require('stripe')

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('[stripe] STRIPE_SECRET_KEY not set — billing features will be unavailable')
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder')

module.exports = { stripe }
