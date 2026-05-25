import Fs from 'node:fs';
import Path from 'node:path';
import { pipeline } from '@huggingface/transformers';
import { ChunkDocs } from './chunk-docs.ts';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_NDIM = 384;
const DATA_DIR = Path.resolve(process.cwd(), 'public', 'data');

export class BuildIndex {
	static async run(): Promise<void> {
		console.error('chunking docs...');
		const chunks = await ChunkDocs.chunkAll();
		console.error(`got ${chunks.length} chunks`);

		console.error(`loading embedding model: ${MODEL_ID}`);
		const extractor = await pipeline('feature-extraction', MODEL_ID);

		console.error('embedding chunks...');
		const embeddings = new Float32Array(chunks.length * EMBEDDING_NDIM);
		for (let i = 0; i < chunks.length; i++) {
			const out = await extractor(chunks[i].text, {
				pooling: 'mean',
				normalize: true,
			});
			const vec = out.data as Float32Array;
			if (vec.length !== EMBEDDING_NDIM) {
				throw new Error(`unexpected embedding dim ${vec.length}, want ${EMBEDDING_NDIM}`);
			}
			embeddings.set(vec, i * EMBEDDING_NDIM);
			process.stderr.write('.');
		}
		process.stderr.write('\n');

		await Fs.promises.mkdir(DATA_DIR, { recursive: true });
		await Fs.promises.writeFile(
			Path.join(DATA_DIR, 'chunks.json'),
			JSON.stringify(chunks),
		);
		await Fs.promises.writeFile(
			Path.join(DATA_DIR, 'embeddings.bin'),
			Buffer.from(embeddings.buffer),
		);
		await Fs.promises.writeFile(
			Path.join(DATA_DIR, 'meta.json'),
			JSON.stringify(
				{ model: MODEL_ID, dim: EMBEDDING_NDIM, count: chunks.length },
				null,
				2,
			),
		);
		console.error(`wrote ${chunks.length} × ${EMBEDDING_NDIM} index to ${DATA_DIR}`);
	}
}

BuildIndex.run().catch((err) => {
	console.error(err);
	process.exit(1);
});
