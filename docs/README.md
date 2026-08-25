# Documentation

## Current product and operations

- [Repository README](../README.md): current phase, product model, production surfaces, setup, and acceptance checks.
- [Architecture and developer map](architecture.md): runtime entries, service ownership, tenancy, hosting, background work, and where to make changes.
- [MCP and OAuth](mcp.md): 22-tool catalog, connection setup, Review Card, permissions, and safety boundary.
- [Operations and deployment](operations.md): environment, migrations, host split, background drains, ledger retention, and production verification.
- [Self-hosting](self-hosting.md): Docker Compose and Railway topology, account flows, readiness, MCP setup, backup/restore, upgrades, rollback, and current ceiling.
- [Railway deployment contract](../deploy/railway/README.md): five-service Hobby-compatible mapping, generated variables, private networking, health, and cron settings.
- [v0.1.0 public-release audit](security-audit-v0.1.0.md): current secret, history, asset, Actions-log, and dependency release gates.
- [Release plan](../FEATURE_PLAN.md): canonical open-source-first plan and Cloud-coming-soon gates.
- [RSS scheduler](rss-scheduler.md): protected scheduled feed processing.
- [UI system](../UI_UX.md): Device Console rules, current information architecture, and responsive behavior.
- [Agent context](../AGENTS.md): repository-specific implementation and release rules.

New developers should read the README, feature plan, architecture map, and AGENTS context first. Unchecked roadmap items are not existing product capabilities.

## Independent open-source tools

- [Free & Open Source Tools hub](https://blogfactory.io/open-source-tools/)
- [Source-Backed Blog Writer](https://blogfactory.io/open-source-tools/source-backed-blog-writer/): a CC BY 4.0 Agent Skill for evidence-backed article research and drafting.
- [Ghost Publisher MCP](https://blogfactory.io/open-source-tools/ghost-publisher-mcp/): an MIT-licensed local Ghost CMS MCP server with explicit write controls.

These projects are maintained by BlogFactoryHQ but install and operate independently from BlogFactory.

## Historical decision records

These files preserve rationale and acceptance context from the date they were written. They are not current release status or product commitments; when they conflict, use the code and current documents above.

- [Campaign model plan](campaign-model-plan.md)
- [Knowledge documents plan](knowledge-documents-plan.md)
- [Optimize + Search Console plan](optimize-gsc-plan.md)
- [Closed-issue audit — 2026-07-12](closed-issue-audit-2026-07-12.md)
- [Original MCP roadmap](../BLOGFACTORY_MCP_ROADMAP.md)
