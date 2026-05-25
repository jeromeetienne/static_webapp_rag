import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type Chunk = {
	id: string;
	text: string;
	source: string;
	offset: number;
};

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;
const DOCUMENTS_DIR = 'docs';

export class ChunkDocs {
	static async run(): Promise<void> {
		const chunks = await ChunkDocs.chunkAll();
		console.log(JSON.stringify(chunks, null, 2));
		console.error(`chunked ${chunks.length} pieces from ${DOCUMENTS_DIR}/`);
	}

	static async chunkAll(): Promise<Chunk[]> {
		const docsDir = path.resolve(process.cwd(), DOCUMENTS_DIR);
		const entries = await fs.readdir(docsDir);
		const out: Chunk[] = [];
		for (const file of entries.sort()) {
			if (/\.(md|txt)$/i.test(file) === false) continue;
			const text = await fs.readFile(path.join(docsDir, file), 'utf-8');
			out.push(...ChunkDocs.chunkText(text, file));
		}
		return out;
	}

	static chunkText(text: string, source: string): Chunk[] {
		const chunks: Chunk[] = [];
		let start = 0;
		while (start < text.length) {
			let end = Math.min(start + CHUNK_SIZE, text.length);
			if (end < text.length) {
				end = ChunkDocs.findBoundary(text, start, end);
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

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly === true) {
	ChunkDocs.run().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
