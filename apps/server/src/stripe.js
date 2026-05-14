const Stripe = require('stripe')

function requireStripeSecret() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('[stripe] Missing required environment variable: STRIPE_SECRET_KEY')
  }
  if (!key.startsWith('sk_')) {
    throw new Error('[stripe] STRIPE_SECRET_KEY must be a Stripe secret key starting with sk_')
  }
  return key
}

const stripe = new Stripe(requireStripeSecret())

module.exports = { stripe }
