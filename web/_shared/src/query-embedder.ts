import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

export class QueryEmbedder {
	private extractor: FeatureExtractionPipeline | null = null;
	private loading: Promise<FeatureExtractionPipeline> | null = null;

	async embed(text: string): Promise<Float32Array> {
		const ext = await this.getExtractor();
		const out = await ext(text, { pooling: 'mean', normalize: true });
		return out.data as Float32Array;
	}

	private async getExtractor(): Promise<FeatureExtractionPipeline> {
		if (this.extractor !== null) return this.extractor;
		if (this.loading === null) {
			this.loading = pipeline('feature-extraction', MODEL_ID) as Promise<FeatureExtractionPipeline>;
		}
		this.extractor = await this.loading;
		return this.extractor;
	}
}
