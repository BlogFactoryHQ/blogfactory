VPS Initial Setup Guide

  Prerequisites:
  - Hetzner VPS with Ubuntu 24.04 (CX22 or similar)
  - Cloudflare Tunnel already configured with SSH access at rmt.blogfactory.io
  - Neon managed Postgres database

  Users:
  - selim — admin user (sudo access)
  - deploy — CI/CD user (no sudo, runs Docker)

  1. Install Docker (as selim)

  curl -fsSL https://get.docker.com | sudo sh

  2. Create deploy user (as selim)

  sudo adduser --disabled-password --gecos "" deploy
  sudo usermod -aG docker deploy

  3. Set up deploy SSH key for GitHub Actions (as selim)

  sudo -u deploy ssh-keygen -t ed25519 -C "github-actions" -f /home/deploy/.ssh/github_actions -N ""
  sudo -u deploy bash -c 'cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys'
  sudo cat /home/deploy/.ssh/github_actions  # Copy this → GitHub secret VPS_SSH_KEY

  4. Set up deploy key for GitHub repo access (as selim)

  sudo -u deploy ssh-keygen -t ed25519 -C "deploy-key" -f /home/deploy/.ssh/deploy_key -N ""
  sudo cat /home/deploy/.ssh/deploy_key.pub  # Add as deploy key in GitHub repo settings

  sudo -u deploy tee /home/deploy/.ssh/config > /dev/null << 'EOF'
  Host github.com
    IdentityFile ~/.ssh/deploy_key
    StrictHostKeyChecking no
  EOF
  sudo chmod 600 /home/deploy/.ssh/config
  sudo chown deploy:deploy /home/deploy/.ssh/config

  5. Clone repo (as selim)

  sudo -u deploy git clone git@github.com:BoraGkc/editorial-flow.git /home/deploy/blogfactory

  6. Cloudflare Tunnel — API ingress (as selim)

  The tunnel should already be running with SSH access at rmt.blogfactory.io.
  Add an ingress rule for the API:

  Edit ~/.cloudflared/config.yml and add before the catch-all rule:
    - hostname: api.blogfactory.io
      service: http://localhost:3000

  Then restart the tunnel:
  sudo systemctl restart cloudflared

  7. Add GitHub secrets

  Go to GitHub repo Settings → Secrets and variables → Actions.
  The .env file is written by the deploy workflow from these secrets:

  ┌──────────────────────┬────────────────────────────────────────────────────┐
  │       Secret         │                      Value                         │
  ├──────────────────────┼────────────────────────────────────────────────────┤
  │ VPS_SSH_KEY          │ deploy user's ~/.ssh/github_actions (private key)  │
  │ DATABASE_URL         │ Neon connection string                             │
  │ JWT_SECRET           │ openssl rand -base64 32                            │
  │ S3_ENDPOINT          │ R2 S3 API endpoint                                │
  │ S3_ACCESS_KEY_ID     │ R2 access key                                     │
  │ S3_SECRET_ACCESS_KEY │ R2 secret key                                     │
  │ OPENROUTER_API_KEY   │ (optional) OpenRouter key                         │
  │ WIX_API_KEY          │ (optional) Wix API key                            │
  │ WIX_SITE_ID          │ (optional) Wix site ID                            │
  │ WIX_MEMBER_ID        │ (optional) Wix member ID                          │
  │ GOOGLE_AI_KEY        │ (optional) Google AI key                           │
  └──────────────────────┴────────────────────────────────────────────────────┘

  8. Docker log rotation (as selim)

  sudo tee /etc/docker/daemon.json > /dev/null << 'EOF'
  {
    "log-driver": "json-file",
    "log-opts": {
      "max-size": "10m",
      "max-file": "3"
    }
  }
  EOF
  sudo systemctl restart docker

  9. First deploy

  Trigger manually: gh workflow run "Deploy Backend" --repo BoraGkc/editorial-flow
  Or push a change to api/ on main.
