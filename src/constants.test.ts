import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLUGIN_ID, PLUGIN_NAME } from './constants';

interface ManifestIdentity {
	id: string;
	name: string;
}

const manifest = JSON.parse(
	readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'),
) as ManifestIdentity;

describe('plugin identity', () => {
	it('matches the manifest id and name', () => {
		expect(PLUGIN_ID).toBe(manifest.id);
		expect(PLUGIN_NAME).toBe(manifest.name);
	});
});
