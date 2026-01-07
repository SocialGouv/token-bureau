# 🦉 TokenBureau

TokenBureau is a secure service for generating GitHub App tokens using OIDC verification. It includes both a server implementation and a GitHub Action for easy integration.

## GitHub Action Usage

Add the TokenBureau action to your workflow:

```yaml
permissions:
  id-token: write  # Required for OIDC token generation

steps:
  - name: Get GitHub App Token
    id: token
    uses: SocialGouv/token-bureau@main
    with:
      token-bureau-url: https://your-token-bureau-service.com
      audience: your-audience-value

  # Use the token in subsequent steps
  - name: Use Token
    env:
      GITHUB_TOKEN: ${{ steps.token.outputs.token }}
    run: |
      # Your commands using the token
```

### Action Inputs

- `token-bureau-url`: (Required) URL of the Token-Bureau service
- `audience`: (Required) OIDC audience value
- `permissions`: (Optional) JSON string of GitHub App permissions to request. Must be allowed by server configuration.
  ```yaml
  permissions: '{"contents": "read", "issues": "write"}'
  ```

### Action Outputs

- `token`: The generated GitHub App token
- `expires_at`: Token expiration timestamp
- `installation_id`: GitHub App installation ID

### Fine-Grained Permissions

Token-Bureau supports fine-grained permission control through server configuration and per-workflow requests.

#### Server Configuration

Create a `permissions.yml` file in the server's config directory:

```yaml
# Default permissions that apply to all repositories
default:
  permissions:
    contents: write
    metadata: read
    issues: write
    pull_requests: write

# Repository-specific permission overrides
repositories:
  "myorg/*":  # Organization-wide defaults
    permissions:
      contents: read
      issues: read
  
  "myorg/specific-repo":  # Repository-specific override
    permissions:
      contents: write
      issues: none  # Disable issues permission

```

Available permissions:
- contents
- metadata
- issues
- pull_requests
- deployments
- packages
- actions
- security_events
- statuses
- checks
- discussions
- pages
- workflows

Access levels:
- read
- write
- none (to explicitly disable)

#### Permission Inheritance

Permissions are resolved in the following order:
1. Default permissions (base level)
2. Organization wildcard overrides (e.g., "myorg/*")
3. Repository-specific overrides
4. Requested permissions (must be within allowed scope)

#### Workflow Usage Examples

Basic usage (uses default permissions):
```yaml
- uses: SocialGouv/token-bureau@main
  with:
    token-bureau-url: https://your-token-bureau.com
    audience: your-audience
```

Request specific permissions:
```yaml
- uses: SocialGouv/token-bureau@main
  with:
    token-bureau-url: https://your-token-bureau.com
    audience: your-audience
    permissions: '{"contents": "read", "issues": "write"}'
```

Least privilege example:
```yaml
- uses: SocialGouv/token-bureau@main
  with:
    token-bureau-url: https://your-token-bureau.com
    audience: your-audience
    permissions: '{"contents": "read"}'  # Request only needed permissions
```

## Server Setup

### Using Docker

```bash
# Build the image
docker build -t token-bureau .

# Run the container
docker run -p 3000:3000 \
  -e GITHUB_APP_ID=your_app_id \
  -e GITHUB_PRIVATE_KEY="$(cat path/to/private-key.pem)" \
  -e OIDC_AUDIENCE=your_audience \
  token-bureau
```

### Manual Setup

1. Clone the repository:
```bash
git clone https://github.com/SocialGouv/token-bureau.git
cd token-bureau
```

2. Copy the environment template:
```bash
cp .env.example .env
```

3. Configure environment variables in `.env`:
```env
# Server Configuration
PORT=3000

# GitHub App Configuration
GITHUB_APP_ID=your_github_app_id
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
your_private_key_here
-----END RSA PRIVATE KEY-----"

# OIDC Configuration
OIDC_AUDIENCE=your_external_service_audience
```

4. Install dependencies and start the server:
```bash
 corepack prepare pnpm@10.27.0 --activate
 corepack pnpm install
 corepack pnpm --filter token-bureau-server start
```

## GitHub App Setup

1. Create a GitHub App:
   - Navigate to **Settings** > **Developer settings** > **GitHub Apps** > **New GitHub App**
   - Set required permissions:
     - **Contents**: **Read & Write** (Required for repository content access)
     - **Metadata**: **Read** (Required for basic repository information)
     - **Issues**: **Read & Write** (Required for semantic-release to create and manage issues)

2. Install the GitHub App:
   - Go to the **Install App** tab
   - Select your organization/account
   - Choose repositories that need token generation

3. Configure the app:
   - Generate and download the private key
   - Note the App ID
   - Add these to your environment configuration

## Repository Rules and Permissions

### Branch Protection: Rulesets vs Legacy Rules

GitHub offers two ways to protect branches: modern rulesets and legacy branch protection rules. We recommend using rulesets because:
- Only rulesets allow adding GitHub Apps (like TokenBureau) to global bypass lists
- Rulesets provide more granular control and modern features
- They support the same protection features as legacy rules

If you're using legacy branch protection rules, consider migrating to rulesets to ensure TokenBureau can function properly.

### Repository Rules Bypass

When using repository rulesets, you must add the GitHub App to the bypass list for any rules that might interfere with its operation:

1. Navigate to your repository or organization settings
   - Repository: `https://github.com/[owner]/[repo]/settings/rules`
   - Organization: `https://github.com/organizations/[org]/settings/rules`

2. For each ruleset that might affect the app's operations:
   - Click on the ruleset name
   - Scroll to "Bypass list"
   - Click "Add bypass"
   - Select your GitHub App from the list
   - Click "Add bypass" to confirm

This is particularly important for rulesets that:
- Require status checks
- Control branch/tag creation or deletion
- Enforce commit signing
- Restrict push access
- Require pull requests before merging

### Force Push Permissions

Depending on your use case, you may need to grant TokenBureau force push permissions:

1. For Repository Rulesets:
   - In the ruleset settings, locate the "Restrict force pushes" section
   - Add TokenBureau to either:
     - The "Specify who can force push" list
     - The global bypass list (recommended)

2. For Legacy Branch Protection:
   - In branch protection settings, find "Allow force pushes"
   - Add TokenBureau to the list of actors allowed to force push
   - Note: This is another reason to prefer rulesets, as they offer more flexible force push controls

3. For Branch Restrictions:
   - If you have "Restrict who can push to matching branches" enabled
   - Add TokenBureau to the allowed list of actors

## Troubleshooting

### Permission Errors

If you encounter the error "The permissions requested are not granted to this installation", follow these steps:

1. **Update GitHub App Permissions**:
   - Go to your GitHub App settings
   - Under "Permissions & events", ensure all required permissions are configured:
     - Repository Contents: Read & write
     - Metadata: Read-only
     - Issues: Read & write
     - Pull requests: Read & write
   - Click "Save changes"

2. **Update Existing Installations**:
   - After updating permissions, GitHub will prompt all existing installations to review and accept the new permissions
   - Go to your GitHub App's "Install App" tab
   - For each organization/account where the app is installed:
     - Click "Configure"
     - You should see a banner asking to review and accept the new permissions
     - Review and accept the new permissions
   - Alternatively, you can uninstall and reinstall the app to immediately get the new permissions

3. **Verify Permissions**:
   - After accepting new permissions, it may take a few minutes for changes to propagate
   - You can verify the permissions are active by checking the installation settings
   - If issues persist, try uninstalling and reinstalling the app

## Security Features

- OIDC token verification using GitHub's JWKS endpoint
- Automatic token scoping to the requesting repository
- Environment variable validation
- Request retry logic with proper error handling
- Runs as non-root user in Docker

## Development

To run the server in development mode with auto-reload:

```bash
 corepack pnpm --filter token-bureau-server dev
```

## License

MIT
