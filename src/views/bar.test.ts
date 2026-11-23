import { describe, expect, it } from 'vitest';
import { thresholdStage } from './bar';

describe('thresholdStage', () => {
	it('starts red below 25 percent', () => {
		expect(thresholdStage(0)).toBe(0);
		expect(thresholdStage(24)).toBe(0);
	});

	it('turns orange at 25 percent', () => {
		expect(thresholdStage(25)).toBe(1);
		expect(thresholdStage(49)).toBe(1);
	});

	it('turns blue at 50 percent', () => {
		expect(thresholdStage(50)).toBe(2);
		expect(thresholdStage(74)).toBe(2);
	});

	it('turns green at 75 percent', () => {
		expect(thresholdStage(75)).toBe(3);
		expect(thresholdStage(100)).toBe(3);
	});
});
