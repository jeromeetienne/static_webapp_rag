import { IndexLoader, type Index } from '../../_shared/src/index-loader.ts';
import { QueryEmbedder } from '../../_shared/src/query-embedder.ts';
import { Retriever, type Hit } from '../../_shared/src/retriever.ts';
import { Llm, DEFAULT_MODEL, MOBILE_MODEL } from '../../_shared/src/llm.ts';
import { Device } from '../../_shared/src/device.ts';

const TOP_K = 3;

class Main {
	static async run(): Promise<void> {
		const app = document.querySelector<HTMLDivElement>('#app');
		if (app === null) {
			throw new Error('#app not found');
		}
		app.textContent = 'Loading index...';
		try {
			const index = await IndexLoader.load();
			Main.renderUi(app, index);
		} catch (err) {
			app.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
			throw err;
		}
	}

	static renderUi(app: HTMLDivElement, index: Index): void {
		const embedder = new QueryEmbedder();
		const modelId = Device.isMobile() === true ? MOBILE_MODEL : DEFAULT_MODEL;
		const llm = new Llm(modelId);
		const sources = new Set(index.chunks.map((c) => c.source));

		app.replaceChildren();
		app.style.fontFamily = 'system-ui, sans-serif';
		app.style.maxWidth = '900px';
		app.style.margin = '20px auto';
		app.style.padding = '0 16px';

		const h1 = document.createElement('h1');
		h1.textContent = 'Static RAG';
		app.appendChild(h1);

		const intro = document.createElement('p');
		intro.style.color = '#555';
		intro.textContent = `${index.meta.count} chunks across ${sources.size} doc(s) (${[...sources].join(', ')}). Embedding model: ${index.meta.model}.`;
		app.appendChild(intro);

		const form = document.createElement('form');
		form.style.margin = '16px 0';
		const input = document.createElement('input');
		input.type = 'text';
		input.placeholder = 'Ask a question about the docs...';
		input.style.width = '70%';
		input.style.padding = '8px';
		input.style.marginRight = '8px';
		const button = document.createElement('button');
		button.type = 'submit';
		button.textContent = 'Ask';
		button.style.padding = '8px 16px';
		button.disabled = true;
		form.appendChild(input);
		form.appendChild(button);
		app.appendChild(form);

		const status = document.createElement('p');
		status.style.color = '#888';
		status.style.fontSize = '0.9em';
		status.textContent = `Loading ${modelId}...`;
		app.appendChild(status);

		const answerSection = document.createElement('section');
		const answerHeader = document.createElement('h2');
		answerHeader.textContent = 'Answer';
		answerHeader.style.fontSize = '1.1em';
		answerHeader.style.color = '#444';
		const answerEl = document.createElement('pre');
		answerEl.style.whiteSpace = 'pre-wrap';
		answerEl.style.background = '#fafafa';
		answerEl.style.border = '1px solid #eee';
		answerEl.style.padding = '12px';
		answerEl.style.borderRadius = '4px';
		answerEl.style.minHeight = '40px';
		answerEl.style.fontFamily = 'system-ui, sans-serif';
		answerSection.appendChild(answerHeader);
		answerSection.appendChild(answerEl);
		app.appendChild(answerSection);

		const sourcesSection = document.createElement('section');
		const sourcesHeader = document.createElement('h2');
		sourcesHeader.textContent = 'Retrieved sources';
		sourcesHeader.style.fontSize = '1.1em';
		sourcesHeader.style.color = '#444';
		const sourcesEl = document.createElement('div');
		sourcesSection.appendChild(sourcesHeader);
		sourcesSection.appendChild(sourcesEl);
		app.appendChild(sourcesSection);

		form.addEventListener('submit', (e) => {
			e.preventDefault();
			const query = input.value.trim();
			if (query === '') return;
			Main.runQuery(
				query,
				index,
				embedder,
				llm,
				button,
				status,
				answerEl,
				sourcesEl,
			).catch((err) => {
				status.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
				button.disabled = false;
			});
		});

		llm.preload((msg) => {
			status.textContent = `Loading model: ${msg}`;
		}).then(() => {
			status.textContent = `Ready.`;
			button.disabled = false;
		}).catch((err: unknown) => {
			status.textContent = `LLM load failed: ${err instanceof Error ? err.message : String(err)}`;
		});
	}

	static async runQuery(
		query: string,
		index: Index,
		embedder: QueryEmbedder,
		llm: Llm,
		button: HTMLButtonElement,
		status: HTMLElement,
		answerEl: HTMLElement,
		sourcesEl: HTMLElement,
	): Promise<void> {
		button.disabled = true;
		answerEl.textContent = '';
		sourcesEl.replaceChildren();

		status.textContent = 'Embedding query...';
		const tEmbed = performance.now();
		const vec = await embedder.embed(query);
		const embedMs = (performance.now() - tEmbed).toFixed(0);

		const hits = Retriever.topK(vec, index, TOP_K);
		Main.renderHits(sourcesEl, index, hits);
		status.textContent = `Retrieved ${hits.length} chunks (${embedMs}ms). Generating answer...`;

		const contextChunks = hits.map((h) => ({
			text: index.chunks[h.index].text,
			source: index.chunks[h.index].source,
		}));

		const tGen = performance.now();
		await llm.generate(
			query,
			contextChunks,
			(token) => {
				answerEl.textContent += token;
			},
			(msg) => {
				status.textContent = `Loading LLM: ${msg}`;
			},
		);
		const genMs = (performance.now() - tGen).toFixed(0);
		status.textContent = `Done — embed ${embedMs}ms, generate ${genMs}ms.`;
		button.disabled = false;
	}

	static renderHits(container: HTMLElement, index: Index, hits: Hit[]): void {
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
			pre.style.fontSize = '0.9em';
			pre.textContent = chunk.text;
			li.appendChild(pre);

			ol.appendChild(li);
		}
		container.appendChild(ol);
	}
}

Main.run();
