# Netlify Open Source program: BlogFactory eligibility assessment

**Research date:** 2026-09-14
**Scope:** read-only assessment. “Eligible to apply” is not an approval; Netlify reviews applications and retains free-tier discretion.

## Conclusion

**Do not apply for the current BlogFactory public site or BlogFactory Cloud worker as-is.** The public `BlogFactoryHQ/blogfactory` repository satisfies the license and public-project evidence, but it has no visible Code of Conduct at the repository root or in its documentation navigation, so it does **not** meet a published mandatory criterion. More importantly, Netlify excludes commercial projects, including commercial hosting; the public marketing surface contains a Cloud waitlist/future-pricing purpose, while the persistent Cloud application is a private managed-service deployment. Those are material review risks, not ambiguities to paper over.

A later, narrower application could be reasonable **only** for a separate non-commercial, Netlify-hosted public-project surface (for example, documentation for the public repository), after adding the required Code of Conduct and visible Netlify attribution. It must not subsidize the private Cloud application, customer traffic, or a commercial support/hosting service.

## Current Netlify policy — every published criterion

| Published requirement | BlogFactory evidence | Assessment |
| --- | --- | --- |
| Site content must be directly related to the community around open-source-licensed software. | The public repo describes an open-source, self-hosted control plane and ships self-host documentation. | **Potentially passes** for a dedicated project docs/community site. A general Cloud-marketing/waitlist site is not clearly within this scope. |
| OSI-approved license, or specified CC/public-domain alternative. | Public repository is AGPL-3.0-only; the repository is public. | **Passes.** AGPL-3.0 is OSI-approved; the public GitHub page also labels the repo “Public” and links the license. |
| Code of Conduct at repository top level, or prominently in documentation with a navigation/footer/homepage link. | GitHub’s root-file listing shows no `CODE_OF_CONDUCT*`; the public `CONTRIBUTING.md` has contribution rules but no Code of Conduct. | **Fails now.** Add an actual Code of Conduct and a prominent docs link before applying. |
| Netlify link on the main page or all internal pages: a badge, or exact “This site is powered by Netlify” text linking Netlify’s home page. | Current public marketing is Cloudflare-served; no Netlify attribution was evidenced. | **Fails now** for a proposed Netlify surface until the site is hosted there and attribution is added. |
| Non-commercial project, whether made by a company or individual; commercial support and hosting are expressly prohibited. | Public core says Cloud is “coming soon,” but the architecture assigns a private marketing repo to a public waitlist/future-pricing site and a private Cloud repo to hosted deployment, Cloud-only code, billing, and entitlements. | **Cannot be asserted for the existing combined product site; high rejection risk.** A distinct, non-commercial public-project/docs site is the only defensible scope. |

The current policy publishes no contributor-count threshold, minimum project age, release count, organization type, incorporation-status, or annual reapplication requirement. Do not add invented requirements; Netlify can still reject during review.

## Application, benefits, and continuing restrictions

The application form requires the applicant’s name, the email associated with their Netlify account, project license, Code of Conduct link, and project link; extra detail is optional. The policy directs qualifying projects to that form **for review**, so satisfying the table is eligibility to request sponsorship, not an entitlement.

Approved projects receive 10,000 credits per month, free production deploys, unlimited team members, and Deploy Previews for every pull request. Sites remain live after credits are consumed; additional credits cost the Pro-plan rate. The Code of Conduct is required to maintain the plan. If Netlify finds that a site no longer appears to concern open-source software or lacks its Netlify link, it notifies the owner and may downgrade after notice and no response.

There is no stated periodic renewal/reapplication cadence in the current policy. That is **not** a permanence guarantee: the plan is governed by the Free Usage Tier, which Netlify may change or discontinue; it may disable/remove a free-tier site at its discretion, with no service-level commitment in the shared build environment. Retain deploy/data exit paths and do not use the program for a production component that needs a contractual SLA.

## Hosting boundary

| Surface | Open Source program fit | Reason |
| --- | --- | --- |
| Public source documentation, changelog, community blog, or issue-tracker-adjacent site for `BlogFactoryHQ/blogfactory` | **Possible after remediating Code of Conduct + attribution and keeping it non-commercial.** | These are the policy’s own examples of qualifying auxiliary community material. |
| `blogfactory.io` marketing site as currently architected | **Do not represent it as eligible.** | It includes a waitlist and future-pricing content, which makes commercial focus a material ambiguity under an explicit non-commercial rule. Netlify—not BlogFactory—would decide. |
| Persistent BlogFactory Cloud app/API/worker | **No.** | It is a private managed-service layer, and the public repo expressly says Netlify lacks the complete API, worker, PostgreSQL, and object-storage topology. The OSS sponsorship must not be used to host it. |

## Minimal path if sponsorship is wanted

1. Keep the target separate: public open-source docs/community only; no Cloud customer application, private API, waitlist conversion, billing, commercial hosting, or support-service workload.
2. Add a top-level Code of Conduct and link it prominently in the public docs/site navigation.
3. Deploy that site on Netlify, add the required visible attribution, then submit the required form with its Netlify-account email, license, CoC URL, and project URL.
4. State the private Cloud boundary candidly in optional details; do not claim acceptance or move Cloud infrastructure before Netlify confirms approval.

## Sources

- [Netlify Open Source Plan Policy](https://www.netlify.com/legal/open-source-policy/) — qualification rules, attribution, commercial exclusion, examples, downgrade process, credits, and Free Usage Tier cross-reference.
- [Netlify Open Source program page](https://www.netlify.com/open-source/) — Deploy Previews, credit exhaustion behavior, and Code of Conduct maintenance statement.
- [Netlify Open Source application form](https://opensource-form.netlify.com/) — currently required fields.
- [Netlify Self-Serve Subscription Agreement, §6](https://www.netlify.com/legal/self-serve-subscription-agreement/#6-free-usage-tier) — discretionary Free Usage Tier, removal/discontinuation, shared environment, and no SLA.
- [BlogFactory public GitHub repository](https://github.com/BlogFactoryHQ/blogfactory) — public status, AGPL-3.0-only license, open-source/self-hosted description, and root file listing.
- [BlogFactory release plan](https://github.com/BlogFactoryHQ/blogfactory/blob/main/FEATURE_PLAN.md) — public-core/Cloud-coming-soon boundary and explicit statement that Netlify is not a full deployment target.
- [BlogFactory architecture](https://github.com/BlogFactoryHQ/blogfactory/blob/main/docs/architecture.md) — public marketing waitlist/future-pricing and private Cloud deployment ownership.
- [BlogFactory self-hosting guide](https://github.com/BlogFactoryHQ/blogfactory/blob/main/docs/self-hosting.md) — Netlify unsupported for the complete API/worker/data topology.
