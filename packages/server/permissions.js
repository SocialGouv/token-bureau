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
  const repoPath = `${owner}/${repo}`;
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

export { getEffectivePermissions, loadPermissionsConfig };
