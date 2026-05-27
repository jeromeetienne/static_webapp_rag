import Fs from 'node:fs';
import Path from 'node:path';
import * as Transformer from '@huggingface/transformers';
import { ChunkMain } from './chunking/chunk_main.ts';

const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_NDIM = 384;
const ENCODED_DIR = Path.resolve(process.cwd(), 'web', 'public', 'documents_encoded');

export class BuildIndex {
	static async run(): Promise<void> {
		console.error('chunking docs...');
		const chunks = await ChunkMain.chunkAll();
		console.error(`got ${chunks.length} chunks`);

		console.error(`loading embedding model: ${EMBEDDING_MODEL}`);
		const extractor = await Transformer.pipeline('feature-extraction', EMBEDDING_MODEL);

		console.error('embedding chunks...');
		const embeddings = new Float32Array(chunks.length * EMBEDDING_NDIM);
		for (let i = 0; i < chunks.length; i++) {
			const tensorOut = await extractor(chunks[i].text, {
				pooling: 'mean',
				normalize: true,
			});
			const vector = tensorOut.data as Float32Array;
			if (vector.length !== EMBEDDING_NDIM) {
				throw new Error(`unexpected embedding dim ${vector.length}, want ${EMBEDDING_NDIM}`);
			}
			embeddings.set(vector, i * EMBEDDING_NDIM);
			process.stderr.write('.');
		}
		process.stderr.write('\n');

		///////////////////////////////////////////////////////////////////////////////
		///////////////////////////////////////////////////////////////////////////////
		//	
		///////////////////////////////////////////////////////////////////////////////
		///////////////////////////////////////////////////////////////////////////////

		await Fs.promises.mkdir(ENCODED_DIR, { recursive: true });
		await Fs.promises.writeFile(
			Path.join(ENCODED_DIR, 'chunks.json'),
			JSON.stringify(chunks),
		);
		await Fs.promises.writeFile(
			Path.join(ENCODED_DIR, 'embeddings.bin'),
			Buffer.from(embeddings.buffer),
		);
		await Fs.promises.writeFile(
			Path.join(ENCODED_DIR, 'meta.json'),
			JSON.stringify(
				{ model: EMBEDDING_MODEL, dim: EMBEDDING_NDIM, count: chunks.length },
				null,
				2,
			),
		);
		console.error(`wrote ${chunks.length} × ${EMBEDDING_NDIM} index to ${ENCODED_DIR}`);
	}
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

await BuildIndex.run()