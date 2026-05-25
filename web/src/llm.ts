import {
	CreateMLCEngine,
	type MLCEngine,
	type InitProgressReport,
} from '@mlc-ai/web-llm';

export const DEFAULT_MODEL = 'Llama-3.2-3B-Instruct-q4f16_1-MLC';
export const SMALL_MODEL = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
export const MOBILE_MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';

const SYSTEM_PROMPT = `You are a helpful assistant that answers questions strictly from the provided context.
If the context does not contain the answer, say "I don't know based on the provided documents."
Cite the source filename in parentheses after each fact.`;

export type ProgressHandler = (msg: string) => void;
export type TokenHandler = (token: string) => void;

export type ContextChunk = {
	text: string;
	source: string;
};

export class Llm {
	private engine: MLCEngine | null = null;
	private loading: Promise<MLCEngine> | null = null;
	private readonly model: string;

	constructor(model: string = DEFAULT_MODEL) {
		this.model = model;
	}

	async generate(
		question: string,
		contextChunks: ContextChunk[],
		onToken: TokenHandler,
		onProgress: ProgressHandler,
	): Promise<string> {
		const engine = await this.getEngine(onProgress);

		const context = contextChunks
			.map((c, i) => `[${i + 1}] (source: ${c.source})\n${c.text}`)
			.join('\n\n');

		const userMessage = `Context:\n${context}\n\nQuestion: ${question}`;

		const stream = await engine.chat.completions.create({
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{ role: 'user', content: userMessage },
			],
			stream: true,
			temperature: 0.2,
			max_tokens: 512,
		});

		let full = '';
		for await (const chunk of stream) {
			const token = chunk.choices[0]?.delta?.content ?? '';
			if (token !== '') {
				full += token;
				onToken(token);
			}
		}
		return full;
	}

	private async getEngine(onProgress: ProgressHandler): Promise<MLCEngine> {
		if (this.engine !== null) return this.engine;
		if (this.loading === null) {
			this.loading = CreateMLCEngine(this.model, {
				initProgressCallback: (report: InitProgressReport) => {
					onProgress(report.text);
				},
			});
		}
		this.engine = await this.loading;
		return this.engine;
	}
}
