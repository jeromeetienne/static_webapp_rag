import 'deep-chat';
import { IndexLoader, type Index } from './index-loader.ts';
import { QueryEmbedder } from './query-embedder.ts';
import { Retriever, type Hit } from './retriever.ts';
import { Llm, DEFAULT_MODEL, MOBILE_MODEL } from './llm.ts';
import { Device } from './device.ts';

const TOP_K = 3;

type DeepChatMessage = {
	role: 'user' | 'ai';
	text: string;
};

type DeepChatBody = {
	messages: DeepChatMessage[];
};

type DeepChatSignals = {
	onResponse: (r: { text?: string; error?: string }) => void;
	onClose: () => void;
};

type DeepChatElement = HTMLElement & {
	connect: unknown;
	introMessage: unknown;
	textInput: unknown;
	style: CSSStyleDeclaration;
};

class MainPro {
	static async run(): Promise<void> {
		const app = document.querySelector<HTMLDivElement>('#app');
		if (app === null) {
			throw new Error('#app not found');
		}
		app.textContent = 'Loading index...';
		try {
			const index = await IndexLoader.load();
			MainPro.renderUi(app, index);
		} catch (err) {
			app.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
			throw err;
		}
	}

	static renderUi(app: HTMLDivElement, index: Index): void {
		const embedder = new QueryEmbedder();
		const modelId = Device.isMobile() === true ? MOBILE_MODEL : DEFAULT_MODEL;
		const llm = new Llm(modelId);

		app.replaceChildren();
		app.style.fontFamily = 'system-ui, sans-serif';
		app.style.maxWidth = '900px';
		app.style.margin = '20px auto';
		app.style.padding = '0 16px';

		const h1 = document.createElement('h1');
		h1.textContent = 'Static RAG — Chat Pro';
		app.appendChild(h1);

		const intro = document.createElement('p');
		intro.style.color = '#555';
		intro.style.fontSize = '0.9em';
		intro.textContent = `${index.meta.count} chunks · model: ${modelId}. First question downloads the model (cached after).`;
		app.appendChild(intro);

		const sourcesEl = document.createElement('div');
		const sourcesHeader = document.createElement('h2');
		sourcesHeader.textContent = 'Retrieved sources';
		sourcesHeader.style.fontSize = '1em';
		sourcesHeader.style.color = '#444';
		sourcesHeader.style.marginTop = '20px';

		const chat = document.createElement('deep-chat') as DeepChatElement;
		chat.style.width = '100%';
		chat.style.height = '65vh';
		chat.style.borderRadius = '8px';
		chat.introMessage = {
			text: `Ask a question about the ${index.meta.count} indexed chunks.`,
		};
		chat.textInput = {
			placeholder: { text: 'Ask…' },
		};
		chat.connect = {
			stream: true,
			handler: (body: DeepChatBody, signals: DeepChatSignals) => {
				MainPro.handleQuery(body, signals, index, embedder, llm, sourcesEl).catch(
					(err) => {
						signals.onResponse({
							error: err instanceof Error ? err.message : String(err),
						});
					},
				);
			},
		};
		app.appendChild(chat);

		app.appendChild(sourcesHeader);
		app.appendChild(sourcesEl);
	}

	static async handleQuery(
		body: DeepChatBody,
		signals: DeepChatSignals,
		index: Index,
		embedder: QueryEmbedder,
		llm: Llm,
		sourcesEl: HTMLElement,
	): Promise<void> {
		const lastMessage = body.messages.at(-1);
		const query = lastMessage?.text.trim() ?? '';
		if (query === '') {
			signals.onResponse({ error: 'empty query' });
			return;
		}

		const vec = await embedder.embed(query);
		const hits = Retriever.topK(vec, index, TOP_K);
		MainPro.renderHits(sourcesEl, index, hits);

		const contextChunks = hits.map((h) => ({
			text: index.chunks[h.index].text,
			source: index.chunks[h.index].source,
		}));

		await llm.generate(
			query,
			contextChunks,
			(token) => signals.onResponse({ text: token }),
			(_msg) => {
				// deep-chat shows its own loading bubble; nothing to do here
			},
		);
		signals.onClose();
	}

	static renderHits(container: HTMLElement, index: Index, hits: Hit[]): void {
		container.replaceChildren();
		const ol = document.createElement('ol');
		for (const hit of hits) {
			const chunk = index.chunks[hit.index];
			const li = document.createElement('li');
			li.style.marginBottom = '12px';

			const meta = document.createElement('div');
			meta.style.color = '#666';
			meta.style.fontSize = '0.85em';
			meta.textContent = `${chunk.source} (score ${hit.score.toFixed(3)})`;
			li.appendChild(meta);

			const pre = document.createElement('pre');
			pre.style.whiteSpace = 'pre-wrap';
			pre.style.background = '#f5f5f5';
			pre.style.padding = '8px';
			pre.style.margin = '4px 0';
			pre.style.fontSize = '0.85em';
			pre.textContent = chunk.text;
			li.appendChild(pre);

			ol.appendChild(li);
		}
		container.appendChild(ol);
	}
}

MainPro.run();
