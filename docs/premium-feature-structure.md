# Premium feature structure

**Status: implemented in Settings.** The app now presents Free, Pro, and Business as distinct upgrade paths instead of only listing limits.

## Tier strategy

| Tier | Role | Target user | Core promise |
| --- | --- | --- | --- |
| Free | Acquisition | First-time hosts, quick tests, tiny calls | Try the product without friction |
| Pro | Main paid tier | Creators, tutors, freelancers, support agents | Longer sessions, more guests, history, recordings, accountability |
| Business | Team / operations tier | Small teams, agencies, customer support workflows | Branding, automation, saved assets, cloud records |

## Feature gates

| Feature | Free | Pro | Business |
| --- | --- | --- | --- |
| Guests | 3 | 10 | 20 |
| Session length | 45 minutes | 8 hours | 8 hours |
| Screen share, chat, whiteboard | Yes | Yes | Yes |
| Session history dashboard | No | Yes | Yes |
| Audit log and analytics | No | Yes | Yes |
| Local recording | No | Yes | Yes |
| Cloud recording | No | No | Yes |
| Custom branding | No | No | Yes |
| Webhooks and delivery log | No | No | Yes |
| Saved whiteboards | No | No | Yes |

## Pricing intent

- **Free:** generous enough to prove the product, but capped tightly enough that serious repeat use runs into Pro.
- **Pro at $5/month:** intentionally easy to say yes to; this should be the volume plan.
- **Business at $15/month:** charges for team/customer-facing value, not just raw usage.

## Growth loop

- Keep guests account-free so every session is a product demo.
- Put upgrade prompts where limits are felt: dashboard, recording, branding, webhooks, saved boards, and session creation caps.
- Keep Pro cheap while the product earns trust; raise price later only after retention is proven.
- Use Business for workflow features that companies can expense: branding, logs, cloud assets, and integrations.
