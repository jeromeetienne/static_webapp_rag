import type { Chunk } from './chunk_main.ts';

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

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

	static findBoundary(text: string, start: number, end: number): number {
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
