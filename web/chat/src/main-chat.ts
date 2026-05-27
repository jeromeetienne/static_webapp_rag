import { IndexLoader, type Index } from '../../_shared/src/index-loader.ts';
import { QueryEmbedder } from '../../_shared/src/query-embedder.ts';
import { Retriever } from '../../_shared/src/retriever.ts';
import {
	Llm,
	DEFAULT_MODEL,
	MOBILE_MODEL,
	type ChatHistoryMessage,
} from '../../_shared/src/llm.ts';
import { Device } from '../../_shared/src/device.ts';

const TOP_K = 3;

class MainPro {
	private readonly index: Index;
	private readonly embedder: QueryEmbedder;
	private readonly llm: Llm;
	private readonly modelId: string;
	private readonly history: ChatHistoryMessage[] = [];
	private readonly messagesEl: HTMLElement;
	private readonly inputEl: HTMLInputElement;
	private readonly buttonEl: HTMLButtonElement;
	private readonly statusEl: HTMLElement;
	private modelReady = false;

	constructor(app: HTMLElement, index: Index) {
		this.index = index;
		this.embedder = new QueryEmbedder();
		this.modelId =
			Device.isMobile() === true ? MOBILE_MODEL : DEFAULT_MODEL;
		this.llm = new Llm(this.modelId);

		app.replaceChildren();

		const card = document.createElement('div');
		card.className = 'card shadow-sm flex-grow-1';
		app.appendChild(card);

		this.messagesEl = document.createElement('div');
		this.messagesEl.className =
			'card-body overflow-auto d-flex flex-column gap-2 bg-white';
		this.messagesEl.style.minHeight = '0';
		this.messagesEl.style.flex = '1 1 0';
		card.appendChild(this.messagesEl);

		const footer = document.createElement('div');
		footer.className = 'card-footer bg-light';
		card.appendChild(footer);

		const form = document.createElement('form');
		form.className = 'd-flex gap-2';
		footer.appendChild(form);

		this.inputEl = document.createElement('input');
		this.inputEl.type = 'text';
		this.inputEl.className = 'form-control';
		this.inputEl.placeholder = 'Ask a question about the docs…';
		this.inputEl.autocomplete = 'off';
		form.appendChild(this.inputEl);

		this.buttonEl = document.createElement('button');
		this.buttonEl.type = 'submit';
		this.buttonEl.className = 'btn btn-primary';
		this.buttonEl.textContent = 'Send';
		this.buttonEl.disabled = true;
		form.appendChild(this.buttonEl);

		this.statusEl = document.createElement('p');
		this.statusEl.className = 'text-muted small mt-2 mb-0';
		app.appendChild(this.statusEl);

		form.addEventListener('submit', (e) => {
			e.preventDefault();
			const query = this.inputEl.value.trim();
			if (query === '') return;
			this.inputEl.value = '';
			this.handleQuery(query).catch((err) => {
				this.statusEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
				this.buttonEl.disabled = false;
				this.inputEl.disabled = false;
			});
		});

		this.inputEl.focus();

		this.statusEl.textContent = `Loading LLM ${this.modelId}…`;
		this.llm
			.preload((msg) => {
				if (this.modelReady === false) {
					this.statusEl.textContent = `Loading LLM: ${msg}`;
				}
			})
			.then(() => {
				this.modelReady = true;
				this.statusEl.textContent = `Model ${this.modelId} ready.`;
				this.buttonEl.disabled = false;
			})
			.catch((err) => {
				this.statusEl.textContent = `Model load failed: ${err instanceof Error ? err.message : String(err)}`;
			});
	}

	static async run(): Promise<void> {
		const app = document.querySelector<HTMLDivElement>('#app');
		if (app === null) {
			throw new Error('#app not found');
		}
		app.textContent = 'Loading index…';
		try {
			const index = await IndexLoader.load();
			new MainPro(app, index);
		} catch (err) {
			app.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
			throw err;
		}
	}

	private async handleQuery(query: string): Promise<void> {
		this.buttonEl.disabled = true;
		this.inputEl.disabled = true;

		this.appendUserBubble(query);
		this.history.push({ role: 'user', content: query });

		const { bubble, textEl } = this.appendAssistantBubble();
		textEl.textContent = '…';

		this.statusEl.textContent = 'Embedding query…';
		const tEmbed = performance.now();
		const vec = await this.embedder.embed(query);
		const embedMs = (performance.now() - tEmbed).toFixed(0);

		const hits = Retriever.topK(vec, this.index, TOP_K);

		this.statusEl.textContent = `Retrieved ${hits.length} chunks (${embedMs}ms). Generating…`;
		textEl.textContent = '';

		const contextChunks = hits.map((h) => ({
			text: this.index.chunks[h.index].text,
			source: this.index.chunks[h.index].source,
		}));

		const priorHistory = this.history.slice(0, -1);

		const tGen = performance.now();
		let full = '';
		await this.llm.generate(
			query,
			contextChunks,
			(token) => {
				full += token;
				textEl.textContent = full;
				this.scrollToBottom();
			},
			(msg) => {
				this.statusEl.textContent = `Loading LLM: ${msg}`;
			},
			priorHistory,
		);
		const genMsNum = performance.now() - tGen;
		const genMs = genMsNum.toFixed(0);
		const charsPerSec = genMsNum > 0
			? (full.length / (genMsNum / 1000)).toFixed(1)
			: '0';

		this.history.push({ role: 'assistant', content: full });
		this.statusEl.textContent = `Done — embed ${embedMs}ms, generate ${genMs}ms (${charsPerSec} chars/sec).`;
		this.buttonEl.disabled = false;
		this.inputEl.disabled = false;
		this.inputEl.focus();

		bubble.classList.remove('opacity-75');
	}

	private appendUserBubble(text: string): void {
		const row = document.createElement('div');
		row.className = 'd-flex justify-content-end';

		const bubble = document.createElement('div');
		bubble.className = 'bg-primary text-white rounded px-3 py-2';
		bubble.style.maxWidth = '80%';
		bubble.style.whiteSpace = 'pre-wrap';
		bubble.textContent = text;

		row.appendChild(bubble);
		this.messagesEl.appendChild(row);
		this.scrollToBottom();
	}

	private appendAssistantBubble(): {
		bubble: HTMLElement;
		textEl: HTMLElement;
	} {
		const row = document.createElement('div');
		row.className = 'd-flex justify-content-start';

		const bubble = document.createElement('div');
		bubble.className = 'bg-light border rounded px-3 py-2 opacity-75';
		bubble.style.maxWidth = '80%';

		const textEl = document.createElement('div');
		textEl.style.whiteSpace = 'pre-wrap';
		bubble.appendChild(textEl);

		row.appendChild(bubble);
		this.messagesEl.appendChild(row);
		this.scrollToBottom();

		return { bubble, textEl };
	}

	private scrollToBottom(): void {
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}
}

MainPro.run();
