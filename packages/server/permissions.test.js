import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

// config.js validates the App credentials at import time.
process.env.GITHUB_APP_ID ||= 'test-app-id';
process.env.GITHUB_PRIVATE_KEY ||= 'test-private-key';
process.env.OIDC_AUDIENCE ||= 'test-audience';

const configFile = path.join(os.tmpdir(), 'token-bureau-permissions.test.yml');
process.env.PERMISSIONS_CONFIG_PATH = configFile;

fs.writeFileSync(configFile, `
default:
  permissions:
    contents: write
    metadata: read
    issues: write
repositories:
  "SocialGouv/egapro":
    permissions:
      organization_projects: write
  "OtherOrg/*":
    permissions:
      contents: read
`);

const { getEffectivePermissions, assertPermissionsGranted } = await import('./permissions.js');

after(() => fs.rmSync(configFile, { force: true }));

describe('getEffectivePermissions', () => {
  it('applies the repository override for a bare repo name', async () => {
    const perms = await getEffectivePermissions('SocialGouv', 'egapro');
    assert.equal(perms.organization_projects, 'write');
    assert.equal(perms.contents, 'write');
  });

  it('applies the repository override for an owner/repo claim', async () => {
    const perms = await getEffectivePermissions('SocialGouv', 'SocialGouv/egapro');
    assert.equal(perms.organization_projects, 'write');
  });

  it('leaves other repositories on the defaults', async () => {
    const perms = await getEffectivePermissions('SocialGouv', 'infra-apps');
    assert.equal(perms.organization_projects, undefined);
    assert.equal(perms.contents, 'write');
  });

  it('applies the org wildcard override', async () => {
    const perms = await getEffectivePermissions('OtherOrg', 'anything');
    assert.equal(perms.contents, 'read');
  });

  it('narrows to the requested subset', async () => {
    const perms = await getEffectivePermissions('SocialGouv', 'egapro', {
      issues: 'read',
      organization_projects: 'write'
    });
    assert.deepEqual(perms, { issues: 'read', organization_projects: 'write' });
  });

  it('rejects a permission the repository is not allowed', async () => {
    await assert.rejects(
      getEffectivePermissions('SocialGouv', 'infra-apps', { organization_projects: 'write' }),
      /not allowed for this repository/
    );
  });
});

describe('assertPermissionsGranted', () => {
  it('accepts an exact grant', () => {
    assertPermissionsGranted({ issues: 'write' }, { issues: 'write', metadata: 'read' });
  });

  it('accepts a broader grant', () => {
    assertPermissionsGranted({ issues: 'read' }, { issues: 'write' });
  });

  it('rejects a missing permission', () => {
    assert.throws(
      () => assertPermissionsGranted({ organization_projects: 'write' }, { contents: 'write' }),
      /organization_projects: requested write, granted none/
    );
  });

  it('rejects a downgraded permission', () => {
    assert.throws(
      () => assertPermissionsGranted({ contents: 'write' }, { contents: 'read' }),
      /contents: requested write, granted read/
    );
  });

  it('accepts an access level it does not rank', () => {
    assertPermissionsGranted({ contents: 'write' }, { contents: 'superuser' });
  });
});
