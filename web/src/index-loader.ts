export type Chunk = {
	id: string;
	text: string;
	source: string;
	offset: number;
};

export type Meta = {
	model: string;
	dim: number;
	count: number;
};

export type Index = {
	chunks: Chunk[];
	embeddings: Float32Array;
	meta: Meta;
};

export class IndexLoader {
	static async load(): Promise<Index> {
		const [chunksRes, embedRes, metaRes] = await Promise.all([
			fetch('/data/chunks.json'),
			fetch('/data/embeddings.bin'),
			fetch('/data/meta.json'),
		]);
		if (chunksRes.ok === false || embedRes.ok === false || metaRes.ok === false) {
			throw new Error('failed to fetch index files from /data/ — did you run `npm run build-index`?');
		}
		const meta = (await metaRes.json()) as Meta;
		const chunks = (await chunksRes.json()) as Chunk[];
		const buf = await embedRes.arrayBuffer();
		const embeddings = new Float32Array(buf);

		if (chunks.length !== meta.count) {
			throw new Error(`chunks length ${chunks.length} != meta.count ${meta.count}`);
		}
		if (embeddings.length !== meta.count * meta.dim) {
			throw new Error(
				`embeddings length ${embeddings.length} != count*dim ${meta.count * meta.dim}`,
			);
		}
		return { chunks, embeddings, meta };
	}
}
