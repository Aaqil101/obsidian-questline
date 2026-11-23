/** Threshold buckets for the color-by-progress bar style. */
export type ThresholdStage = 0 | 1 | 2 | 3;

/**
 * Bucket a percentage into four stages: red below 25%, orange below 50%,
 * blue below 75%, and green from 75% up.
 */
export function thresholdStage(percent: number): ThresholdStage {
	if (percent >= 75) return 3;
	if (percent >= 50) return 2;
	if (percent >= 25) return 1;

	return 0;
}
