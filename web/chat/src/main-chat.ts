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
import { CitationLinker } from '../../_shared/src/citation-linker.ts';
import { VoiceInput } from '../../_shared/src/voice-input.ts';
import { marked } from 'marked';

const TOP_K = 3;

class MainChat {
	private readonly index: Index;
	private readonly embedder: QueryEmbedder;
	private readonly llm: Llm;
	private readonly modelId: string;
	private readonly history: ChatHistoryMessage[] = [];
	private readonly knownSources: Set<string>;
	private readonly messagesEl: HTMLElement;
	private readonly inputEl: HTMLInputElement;
	private readonly buttonEl: HTMLButtonElement;
	private readonly statusEl: HTMLElement;
	private modelReady = false;
	private voice: VoiceInput | null = null;
	private voiceBaseText = '';

	constructor(app: HTMLElement, index: Index) {
		this.index = index;
		this.knownSources = new Set(index.chunks.map((c) => c.source));
		this.embedder = new QueryEmbedder();
		this.modelId =
			Device.isMobile() === true ? MOBILE_MODEL : DEFAULT_MODEL;
		this.llm = new Llm(this.modelId);

		app.replaceChildren();

		this.messagesEl = document.createElement('div');
		this.messagesEl.className = 'overflow-auto d-flex flex-column gap-2';
		this.messagesEl.style.minHeight = '0';
		this.messagesEl.style.flex = '1 1 0';
		app.appendChild(this.messagesEl);

		const footer = document.createElement('div');
		footer.className = 'pt-3';
		app.appendChild(footer);

		const form = document.createElement('form');
		footer.appendChild(form);

		const group = document.createElement('div');
		group.className = 'input-group';
		form.appendChild(group);

		this.inputEl = document.createElement('input');
		this.inputEl.type = 'text';
		this.inputEl.className = 'form-control';
		this.inputEl.placeholder = 'Ask a question about the docs…';
		this.inputEl.autocomplete = 'off';
		group.appendChild(this.inputEl);

		if (VoiceInput.isSupported() === true) {
			this.wireMicButton(group);
		}

		this.buttonEl = document.createElement('button');
		this.buttonEl.type = 'submit';
		this.buttonEl.className = 'btn btn-primary';
		this.buttonEl.textContent = 'Send';
		this.buttonEl.disabled = true;
		group.appendChild(this.buttonEl);

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
			new MainChat(app, index);
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
		textEl.replaceChildren(MainChat.makeSpinner());

		this.statusEl.textContent = 'Embedding query…';
		const tEmbed = performance.now();
		const vec = await this.embedder.embed(query);
		const embedMs = (performance.now() - tEmbed).toFixed(0);

		const hits = Retriever.topK(vec, this.index, TOP_K);

		this.statusEl.textContent = `Retrieved ${hits.length} chunks (${embedMs}ms). Generating…`;

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
				textEl.innerHTML = marked.parse(full, { async: false });
				CitationLinker.linkInPlace(textEl, this.knownSources);
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
		bubble.className = 'bg-primary text-white rounded-4 px-3 py-2';
		bubble.style.maxWidth = '80%';
		bubble.style.whiteSpace = 'pre-wrap';
		bubble.style.setProperty('border-bottom-right-radius', '0', 'important');
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
		row.className = 'd-flex justify-content-start mb-3';

		const bubble = document.createElement('div');
		bubble.className = 'bg-light border rounded-4 px-3 py-2 opacity-75';
		bubble.style.maxWidth = '80%';
		bubble.style.setProperty('border-bottom-left-radius', '0', 'important');

		const textEl = document.createElement('div');
		bubble.appendChild(textEl);

		row.appendChild(bubble);
		this.messagesEl.appendChild(row);
		this.scrollToBottom();

		return { bubble, textEl };
	}

	private scrollToBottom(): void {
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}

	private wireMicButton(container: HTMLElement): void {
		const micBtn = document.createElement('button');
		micBtn.type = 'button';
		micBtn.className = 'btn btn-outline-secondary';
		micBtn.setAttribute('aria-label', 'Voice input');
		micBtn.appendChild(MainChat.makeMicIcon());
		container.appendChild(micBtn);

		const setIdle = (): void => {
			micBtn.classList.remove('btn-danger');
			micBtn.classList.add('btn-outline-secondary');
		};
		const setActive = (): void => {
			micBtn.classList.remove('btn-outline-secondary');
			micBtn.classList.add('btn-danger');
		};

		this.voice = new VoiceInput({
			onInterim: (text) => {
				this.inputEl.value = `${this.voiceBaseText}${text}`;
			},
			onFinal: (text) => {
				this.voiceBaseText = `${this.voiceBaseText}${text}`;
				this.inputEl.value = this.voiceBaseText;
			},
			onError: (message) => {
				this.statusEl.textContent = `Mic error: ${message}`;
			},
			onEnd: () => {
				setIdle();
				this.inputEl.focus();
			},
		});

		micBtn.addEventListener('click', () => {
			if (this.voice === null) return;
			if (this.voice.isRunning() === true) {
				this.voice.stop();
				return;
			}
			this.voiceBaseText = this.inputEl.value;
			setActive();
			this.voice.start();
		});
	}

	private static makeMicIcon(): SVGSVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
		svg.setAttribute('width', '16');
		svg.setAttribute('height', '16');
		svg.setAttribute('fill', 'currentColor');
		svg.setAttribute('viewBox', '0 0 16 16');
		const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		p1.setAttribute('d', 'M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5');
		const p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		p2.setAttribute('d', 'M10 8a2 2 0 1 1-4 0V3a2 2 0 1 1 4 0zM8 0a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V3a3 3 0 0 0-3-3');
		svg.appendChild(p1);
		svg.appendChild(p2);
		return svg;
	}

	private static makeSpinner(): HTMLElement {
		const spinner = document.createElement('div');
		spinner.className = 'spinner-border spinner-border-sm text-secondary';
		spinner.setAttribute('role', 'status');
		const hidden = document.createElement('span');
		hidden.className = 'visually-hidden';
		hidden.textContent = 'Loading…';
		spinner.appendChild(hidden);
		return spinner;
	}
}

MainChat.run();
