# Deployment

This public repo does not include the production deployment runbook.

For your own deployment, host the web app and API server on providers of your choice,
then configure the environment variables from the `.env.example` files. Keep all
provider credentials, Supabase service role keys, Stripe secrets, webhook secrets,
R2 secrets, TURN credentials, and admin tokens outside git.

Use GitHub repository secrets, provider dashboards, or a private secrets manager for
production values.