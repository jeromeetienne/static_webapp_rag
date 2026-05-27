import type { Chunk } from './chunk_main.ts';

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

/**
 * Recursive character chunking with overlap — the LangChain
 * RecursiveCharacterTextSplitter shape. Single pass, format-agnostic:
 * treats the input as a char stream with no awareness of markdown,
 * code fences, tables, or headings.
 *
 *   start = 0
 *   while start < len:
 *       end = min(start + CHUNK_SIZE, len)
 *       if end < len: end = findBoundary(...)   // snap to a natural break
 *       emit text[start:end] (trimmed)
 *       start = max(start + 1, end - CHUNK_OVERLAP)
 *
 * findBoundary preference, from most to least semantic:
 *   1. rightmost '\n\n' (paragraph)
 *   2. rightmost '. ', '! ', '? ', '.\n', '!\n', '?\n' (sentence)
 *   3. rightmost ' ' (word)
 *   4. forced cut at `end` (mid-word fallback)
 *
 * A half-window floor (cut must be past start + CHUNK_SIZE/2) prevents
 * tiny chunks under overlap arithmetic and keeps progress monotonic.
 * The `max(start + 1, ...)` guard ensures the cursor advances even when
 * the cut falls within CHUNK_OVERLAP of `start`.
 *
 * Use this for `.txt` (which has no markdown semantics) and as a robust
 * baseline. For `.md` prefer ChunkMarkdownHierarchical, which respects
 * structural boundaries.
 */
export class ChunkTextBoundaryAware {
	static chunkText(text: string, source: string): Chunk[] {
		const chunks: Chunk[] = [];
		let start = 0;
		while (start < text.length) {
			let end = Math.min(start + CHUNK_SIZE, text.length);
			if (end < text.length) {
				end = ChunkTextBoundaryAware.findBoundary(text, start, end);
			}
			const slice = text.slice(start, end).trim();
			if (slice.length > 0) {
				chunks.push({
					id: `${source}::${chunks.length}`,
					text: slice,
					source,
					offset: start,
				});
			}
			if (end >= text.length) break;
			start = Math.max(start + 1, end - CHUNK_OVERLAP);
		}
		return chunks;
	}

	private static findBoundary(text: string, start: number, end: number): number {
		const min = start + Math.floor(CHUNK_SIZE / 2);
		const para = text.lastIndexOf('\n\n', end);
		if (para > min) return para;
		const sentenceSeparators = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
		let bestSentence = -1;
		for (const sep of sentenceSeparators) {
			const idx = text.lastIndexOf(sep, end);
			if (idx > min && idx + sep.length > bestSentence) {
				bestSentence = idx + sep.length;
			}
		}
		if (bestSentence > 0) return bestSentence;
		const space = text.lastIndexOf(' ', end);
		if (space > min) return space;
		return end;
	}
}
