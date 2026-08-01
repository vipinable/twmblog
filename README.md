# twmblog

Personal blog — static site deployed to AWS S3 + CloudFront via CDK.

## Stack

- **Infra:** AWS CDK (TypeScript) — S3 bucket + CloudFront distribution
- **Pipeline:** GitHub Actions — push to `main` triggers deploy
- **Region:** `us-east-1`

## Deploy

Push to `main`. GitHub Actions handles the rest.

Manual deploy:
```bash
npm install
npm install -g aws-cdk
cdk deploy
```

## Custom domain (optional)

1. Get a free subdomain at [is-a.dev](https://github.com/is-a-dev/register) (e.g. `vipin.is-a.dev`)
2. Issue an ACM certificate in `us-east-1` for that domain
3. Add to your GitHub environment vars:
   - `CF_DOMAIN` = `vipin.is-a.dev`
   - `CF_CERT_ARN` = `arn:aws:acm:us-east-1:...`
4. Add a CNAME record pointing your domain to the `DistributionDomain` output

## GitHub Secrets (environment: `prod`)

| Secret  | Value                  |
|---------|------------------------|
| `A_KEY` | AWS access key ID      |
| `S_KEY` | AWS secret access key  |

## Adding posts

Add HTML files to `web/` and link them from `web/index.html`. Push to `main`.
