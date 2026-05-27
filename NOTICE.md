# NOTICE — Attribution

Sayable's AWS scaffold (`backend/`, `infra/`, `frontend/`, `aws/`, `admin/`) was
**copied from and derived from the `gatsby` project** (`~/Development/gatsby`) on
2026-05-25, then adapted.

The shared scaffold provides: the AWS architecture shape (React + Vite PWA on
CloudFront/S3, Node 20 Lambda behind API Gateway HTTP v2 + a streaming Lambda Function
URL, DynamoDB, SES email-OTP → JWT auth, Anthropic model routing, AWS CDK v2), the
`lib/ddb.js` DocumentClient wrapper, the auth flow, and the `aws/*.sh` deploy scripts.

gatsby in turn derived its scaffold from the `nigel` project — the same AWS stack shape.

## What is original to Sayable
Sayable's product, data model (16-table multi-tenant schema with an application-enforced
private/shared boundary), the three AI coaching roles (My Coach / Their Coach / Shared
Mediator), the safety hard-stop, the relationship/thread/invite model, and the visual
design system (see `DESIGN.md`) are original to this project. Sayable forks gatsby's
scaffold, not its skin: none of gatsby's *The Great Gatsby* characters, persona engine,
1920s aesthetic, fonts, or color system carry over.
