import Fs from 'node:fs';
import Path from 'node:path';
import NodeUrl from 'node:url';
import { ChunkTextBoundaryAware } from './chunk_text_boundary_aware.ts';
import { ChunkMarkdownHierarchical } from './chunk_markdown_hierarchical.ts';

export type Chunk = {
	id: string;
	text: string;
	source: string;
	offset: number;
};

const DOCUMENTS_DIR = 'documents_original';

export class ChunkMain {
	static async chunkAll(): Promise<Chunk[]> {
		const docsDir = Path.resolve(process.cwd(), DOCUMENTS_DIR);
		const dirEntries = await Fs.promises.readdir(docsDir);
		const chunks: Chunk[] = [];
		for (const filename of dirEntries.sort()) {
			const ext = Path.extname(filename).toLowerCase();
			const filepath = Path.join(docsDir, filename);
			if (ext === '.md') {
				const text = await Fs.promises.readFile(filepath, 'utf-8');
				const result = ChunkMarkdownHierarchical.chunkText(text, filename);
				for (const child of result.children) {
					chunks.push({
						id: child.id,
						text: child.text,
						source: child.source,
						offset: child.offset,
					});
				}
				continue;
			} else if (ext === '.txt') {
				const text = await Fs.promises.readFile(filepath, 'utf-8');
				chunks.push(...ChunkTextBoundaryAware.chunkText(text, filename));
				continue;
			} else {
				console.error(`chunk_main: unsupported file type ${filename}, skipping`);
			}
		}
		return chunks;
	}
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

if (process.argv[1] === NodeUrl.fileURLToPath(import.meta.url)) {
	const chunks = await ChunkMain.chunkAll();
	console.log(JSON.stringify(chunks, null, 2));
	console.error(`chunked ${chunks.length} pieces from ${DOCUMENTS_DIR}/`);
}
