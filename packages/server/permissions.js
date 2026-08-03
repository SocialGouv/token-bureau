import fs from 'fs';
import yaml from 'js-yaml';
import config from './config.js';

// Cache for the parsed permissions config
let configCache = null;

const VALID_ACCESS_LEVELS = ['read', 'write', 'none'];
const VALID_PERMISSIONS = [
  'contents',
  'metadata',
  'issues',
  'pull_requests',
  'deployments',
  'packages',
  'actions',
  'security_events',
  'statuses',
  'checks',
  'discussions',
  'pages',
  'workflows',
  // Organization-level permission — required for Projects V2 GraphQL
  // mutations (e.g. updating fields on an org ProjectV2 board).
  'organization_projects'
];

// Ordered from least to most privileged, for "is the granted level at least
// the requested one" comparisons.
const ACCESS_LEVEL_RANK = { none: 0, read: 1, write: 2, admin: 3 };

async function validatePermissions(permissions) {
  for (const [perm, level] of Object.entries(permissions)) {
    if (!VALID_PERMISSIONS.includes(perm)) {
      throw new Error(`Invalid permission: ${perm}`);
    }
    if (!VALID_ACCESS_LEVELS.includes(level)) {
      throw new Error(`Invalid access level '${level}' for permission '${perm}'`);
    }
  }
}

async function loadPermissionsConfig() {
  // Return cached config if available
  if (configCache) {
    return configCache;
  }

  const configPath = config.permissionsConfigPath;

  try {
    const fileContents = await fs.promises.readFile(configPath, 'utf8');
    const permissionsConfig = yaml.load(fileContents);

    // Validate default permissions
    if (!permissionsConfig.default?.permissions) {
      throw new Error('Default permissions must be defined');
    }
    await validatePermissions(permissionsConfig.default.permissions);

    // Validate repository-specific permissions
    if (permissionsConfig.repositories) {
      for (const [repo, repoConfig] of Object.entries(permissionsConfig.repositories)) {
        if (!repoConfig.permissions) {
          throw new Error(`Permissions must be defined for repository: ${repo}`);
        }
        await validatePermissions(repoConfig.permissions);
      }
    }

    // Cache the validated config
    configCache = permissionsConfig;
    return permissionsConfig;
  } catch (error) {
    throw new Error(`Failed to load permissions config from ${configPath}: ${error.message}`);
  }
}

async function getEffectivePermissions(owner, repo, requestedPermissions = null) {
  const permissionsConfig = await loadPermissionsConfig();
  const defaultPerms = permissionsConfig.default.permissions;
  // `repo` may arrive bare or as the OIDC `owner/repo` claim; config keys are
  // always `owner/repo`.
  const repoName = repo.includes('/') ? repo.split('/')[1] : repo;
  const repoPath = `${owner}/${repoName}`;
  const orgWildcard = `${owner}/*`;

  // Start with default permissions
  let effectivePerms = { ...defaultPerms };

  // Apply org-wide overrides if they exist
  if (permissionsConfig.repositories?.[orgWildcard]) {
    effectivePerms = {
      ...effectivePerms,
      ...permissionsConfig.repositories[orgWildcard].permissions
    };
  }

  // Apply repository-specific overrides if they exist
  if (permissionsConfig.repositories?.[repoPath]) {
    effectivePerms = {
      ...effectivePerms,
      ...permissionsConfig.repositories[repoPath].permissions
    };
  }

  // If specific permissions are requested, validate them against effective permissions
  if (requestedPermissions) {
    const validatedPerms = {};
    
    for (const [perm, level] of Object.entries(requestedPermissions)) {
      // Check if permission is allowed
      if (!VALID_PERMISSIONS.includes(perm)) {
        throw new Error(`Invalid permission requested: ${perm}`);
      }
      
      // Check if access level is valid
      if (!VALID_ACCESS_LEVELS.includes(level)) {
        throw new Error(`Invalid access level requested: ${level} for ${perm}`);
      }
      
      // Check if requested level is within allowed scope
      const allowedLevel = effectivePerms[perm];
      if (!allowedLevel || allowedLevel === 'none') {
        throw new Error(`Permission ${perm} is not allowed for this repository`);
      }
      
      if (level === 'write' && allowedLevel === 'read') {
        throw new Error(`Write access to ${perm} is not allowed for this repository`);
      }
      
      validatedPerms[perm] = level;
    }
    
    return validatedPerms;
  }

  // Remove 'none' permissions from effective permissions
  return Object.fromEntries(
    Object.entries(effectivePerms).filter(([_, level]) => level !== 'none')
  );
}

// A token carrying less than what was asked for surfaces much later, as an
// opaque "Resource not accessible by integration" in the caller's workflow —
// e.g. after a permission was revoked on the installation. Fail at mint time
// instead. An access level GitHub returns that we don't rank is left alone
// rather than reported as missing.
function assertPermissionsGranted(requested, granted = {}) {
  const missing = Object.entries(requested)
    .filter(([perm, level]) => {
      const grantedLevel = granted[perm];
      if (grantedLevel !== undefined && !(grantedLevel in ACCESS_LEVEL_RANK)) {
        return false;
      }
      return (ACCESS_LEVEL_RANK[grantedLevel] ?? 0) < (ACCESS_LEVEL_RANK[level] ?? 0);
    })
    .map(([perm, level]) => `${perm}: requested ${level}, granted ${granted[perm] ?? 'none'}`);

  if (missing.length > 0) {
    throw new Error(`GitHub did not grant the requested permissions — ${missing.join('; ')}`);
  }
}

export {
  getEffectivePermissions,
  loadPermissionsConfig,
  assertPermissionsGranted
};
