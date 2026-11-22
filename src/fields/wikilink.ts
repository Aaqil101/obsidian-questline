export interface ResolvedLink {
	/** Link target, with any heading or block reference removed. */
	target: string;
	/** Text after the pipe, or null when the link carries no display text. */
	display: string | null;
	/** Heading or block reference after the hash, or null. */
	heading: string | null;
}

const WIKILINK = /\[\[([^\]\n]+)\]\]/;

/**
 * Read a value as a link. A wikilink (`[[Target|Display]]`, `[[Target#Heading]]`)
 * is unpacked into its parts; any other text is taken as a plain target so a
 * hand-written `Goal: Learn Python` still resolves.
 */
export function parseLink(value: string): ResolvedLink | null {
	const text = value.trim();
	if (!text) return null;

	const match = WIKILINK.exec(text);
	if (!match) return { target: text, display: null, heading: null };

	const inner = match[1] ?? '';
	const pipe = inner.indexOf('|');
	const targetPart = (pipe >= 0 ? inner.slice(0, pipe) : inner).trim();
	const display = pipe >= 0 ? inner.slice(pipe + 1).trim() : '';
	const hash = targetPart.indexOf('#');
	const target = (hash >= 0 ? targetPart.slice(0, hash) : targetPart).trim();
	const heading = hash >= 0 ? targetPart.slice(hash + 1).trim() : '';

	if (!target) return null;

	return {
		target,
		display: display || null,
		heading: heading || null,
	};
}
