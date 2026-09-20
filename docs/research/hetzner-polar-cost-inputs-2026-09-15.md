# Hetzner + Polar cost inputs — 2026-09-15

All Hetzner figures are EUR/month, excluding VAT, and are the current-price column for Germany/Finland (including Nuremberg) verified on 2026-09-15. Cloud prices are hourly with a monthly cap; they exclude Primary IPv4.

## Compute inputs

| Use / architecture | Current monthly input |
| --- | ---: |
| Shared ARM (CAX11 / 21 / 31 / 41) | 5.99 / 10.49 / 20.99 / 40.99 |
| Shared x86 cost-optimized (CX23 / 33 / 43 / 53) | 5.49 / 8.49 / 15.99 / 29.49 |
| Shared x86 regular (CPX22 / 32 / 42 / 52 / 62) | 19.49 / 35.49 / 69.49 / 100.49 / 129.99 |
| Dedicated-vCPU x86 (CCX13 / 23 / 33 / 43 / 53 / 63) | 42.99 / 85.99 / 138.49 / 275.99 / 533.49 / 853.49 |
| Nuremberg bare metal (DX182-1 / 2 / 3) | 720.60 / 1,195.60 / 2,095.60 + setup 359 / 599 / 1,049 |

Cloud nomenclature matters: CAX is Ampere ARM; CX is Intel/AMD shared; CPX and CCX are AMD shared/dedicated respectively. Nuremberg bare-metal pricing above is distinct from Cloud dedicated-vCPU. Do not model Server Auction or limited-offering prices as a baseline: availability and price are variable.

Sources: [Hetzner's June 2026 current cloud and dedicated price table](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/), [EU Cloud plan/traffic statement](https://www.hetzner.com/cloud/cost-optimized/).

## Storage, IP, recovery, traffic

| Input | Cost / rule |
| --- | --- |
| Primary IPv4 | EUR 0.50/month each; IPv6 free |
| Cloud Volume | EUR 0.044/GB-month (hourly, monthly cap); 10 GB–10 TB |
| Server backup | 20% of that server's price/month; seven daily slots |
| Server snapshot | EUR 0.011/GB-month of compressed snapshot data |
| Object Storage | EUR 4.99/account-month base; includes 1 TB storage and 1 TB egress (up to 744 TB-hours each) |
| Object Storage operations / ingress / EU-internal traffic | free; egress above included quota is metered |
| EU Cloud server traffic | at least 20 TB included outbound/month; ingress and same-network-zone traffic free |

The public price page's rendered content confirms the 20 TB allowance but did **not expose a numeric EU overage rate** to the verifier. Treat `cloud_egress_overage_eur_per_tb` as **unverified/TBD**, rather than assuming a historical value. Object Storage's public pricing copy confirms pay-as-you-go excess storage/egress but likewise did not expose its numeric excess rates in the accessible official rendering; model both as **TBD until console or price-list confirmation**.

Sources: [Primary IP and traffic billing FAQ](https://docs.hetzner.com/cloud/billing/faq/), [Cloud server networking pricing](https://docs.hetzner.com/cloud/servers/overview/), [Cloud landing page add-on prices](https://www.hetzner.com/de/cloud/?country=en), [Volume limits/billing](https://docs.hetzner.com/cloud/volumes/overview/), [backup/snapshot semantics](https://docs.hetzner.com/cloud/servers/backups-snapshots/overview/), [Object Storage pricing and no-cost operations](https://docs.hetzner.com/storage/object-storage/overview/), [Object Storage base-price announcement](https://www.hetzner.com/pressroom/object-storage/).

## Polar transaction-cost inputs

Polar's public Merchant-of-Record pricing is currently:

| Plan | Fixed monthly | Per transaction |
| --- | ---: | ---: |
| Starter | USD 0 | 5% + USD 0.50 |
| Pro | USD 20 | 3.8% + USD 0.40 |
| Growth | USD 100 | 3.6% + USD 0.35 |
| Scale | USD 400 | 3.4% + USD 0.30 |

Add 1.5% for non-US cards. Current Starter/paid plans have no separate subscription fee. Refunds do not return the original transaction fee; disputes cost USD 15. Payout-provider fees are USD 2 per month with active payouts plus 0.25% + USD 0.25 per payout, plus cross-border conversion (0.25% EU to 1% elsewhere). Organizations created before 2026-05-27 may retain Early Member pricing (4% + USD 0.40 plus 0.5% subscription fee); do not use it for a new-cost model.

Source: [Polar official fees](https://polar.sh/docs/merchant-of-record/fees).

## Model keys

`cloud_server_eur_month`, `primary_ipv4_eur_month=0.50`, `volume_eur_gb_month=0.044`, `server_backup_multiplier=0.20`, `snapshot_eur_gb_month=0.011`, `object_storage_base_eur_month=4.99`, `object_storage_included_storage_tb=1`, `object_storage_included_egress_tb=1`, `cloud_included_egress_tb_month=20`, `cloud_egress_overage_eur_tb=TBD`, `object_storage_excess_storage_eur_tb_month=TBD`, `object_storage_excess_egress_eur_tb=TBD`, `polar_starter_percent=0.05`, `polar_starter_fixed_usd=0.50`, `polar_international_card_percent=0.015`.
