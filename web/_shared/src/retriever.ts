import type { Index } from './index-loader.ts';

export type Hit = {
	index: number;
	score: number;
};

export class Retriever {
	static topK(query: Float32Array, index: Index, k: number): Hit[] {
		const dim = index.meta.dim;
		const count = index.meta.count;
		const hits: Hit[] = new Array(count);
		for (let i = 0; i < count; i++) {
			let dot = 0;
			const base = i * dim;
			for (let d = 0; d < dim; d++) {
				dot += query[d] * index.embeddings[base + d];
			}
			hits[i] = { index: i, score: dot };
		}
		hits.sort((a, b) => b.score - a.score);
		return hits.slice(0, k);
	}
}
