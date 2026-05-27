import { IndexLoader, type Chunk, type Index } from '../../_shared/src/index-loader.ts';

type DocStats = {
	source: string;
	chunks: Chunk[];
	chunkCount: number;
	totalChars: number;
	avgChunkSize: number;
};

class MainStats {
	static async run(): Promise<void> {
		const app = document.querySelector<HTMLDivElement>('#app');
		if (app === null) {
			throw new Error('#app not found');
		}
		app.textContent = 'Loading index...';
		try {
			const index = await IndexLoader.load();
			MainStats.renderUi(app, index);
		} catch (err) {
			app.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
			throw err;
		}
	}

	static computeDocStats(index: Index): DocStats[] {
		const grouped = new Map<string, Chunk[]>();
		for (const chunk of index.chunks) {
			const list = grouped.get(chunk.source);
			if (list === undefined) {
				grouped.set(chunk.source, [chunk]);
			} else {
				list.push(chunk);
			}
		}
		const stats: DocStats[] = [];
		for (const [source, chunks] of grouped) {
			const totalChars = chunks.reduce((sum, c) => sum + c.text.length, 0);
			stats.push({
				source,
				chunks,
				chunkCount: chunks.length,
				totalChars,
				avgChunkSize: Math.round(totalChars / chunks.length),
			});
		}
		stats.sort((a, b) => a.source.localeCompare(b.source));
		return stats;
	}

	static renderUi(app: HTMLDivElement, index: Index): void {
		const docs = MainStats.computeDocStats(index);
		app.replaceChildren();

		const header = document.createElement('h1');
		header.className = 'mb-3';
		header.textContent = 'Indexed Documents';
		app.appendChild(header);

		const lead = document.createElement('p');
		lead.className = 'text-muted';
		lead.textContent = 'Statistics for the corpus indexed at build time. Click a row to inspect its chunks.';
		app.appendChild(lead);

		app.appendChild(MainStats.renderSummary(index, docs));
		app.appendChild(MainStats.renderTable(docs));
	}

	static renderSummary(index: Index, docs: DocStats[]): HTMLElement {
		const totalChars = docs.reduce((sum, d) => sum + d.totalChars, 0);
		const card = document.createElement('div');
		card.className = 'card mb-4';
		const body = document.createElement('div');
		body.className = 'card-body';

		const title = document.createElement('h2');
		title.className = 'card-title h5 mb-3';
		title.textContent = 'Corpus summary';
		body.appendChild(title);

		const row = document.createElement('div');
		row.className = 'row g-3';

		const entries: Array<[string, string]> = [
			['Documents', docs.length.toString()],
			['Chunks', index.meta.count.toString()],
			['Total characters', totalChars.toLocaleString()],
			['Embedding model', index.meta.model],
			['Embedding dim', index.meta.dim.toString()],
		];
		for (const [label, value] of entries) {
			const col = document.createElement('div');
			col.className = 'col-sm-6 col-md-4';
			const labelEl = document.createElement('div');
			labelEl.className = 'text-muted small';
			labelEl.textContent = label;
			const valueEl = document.createElement('div');
			valueEl.className = 'fw-semibold';
			valueEl.textContent = value;
			col.appendChild(labelEl);
			col.appendChild(valueEl);
			row.appendChild(col);
		}
		body.appendChild(row);
		card.appendChild(body);
		return card;
	}

	static renderTable(docs: DocStats[]): HTMLElement {
		const wrapper = document.createElement('div');
		wrapper.className = 'table-responsive';
		const table = document.createElement('table');
		table.className = 'table table-hover align-middle bg-white';

		const thead = document.createElement('thead');
		const headerRow = document.createElement('tr');
		const headers = ['Document', 'Chunks', 'Total chars', 'Avg chunk size'];
		for (const h of headers) {
			const th = document.createElement('th');
			th.scope = 'col';
			th.textContent = h;
			headerRow.appendChild(th);
		}
		thead.appendChild(headerRow);
		table.appendChild(thead);

		const tbody = document.createElement('tbody');
		let i = 0;
		for (const doc of docs) {
			const targetId = `doc-${i}`;
			tbody.appendChild(MainStats.renderSummaryRow(doc, targetId));
			tbody.appendChild(MainStats.renderDetailRow(doc, targetId));
			i += 1;
		}
		table.appendChild(tbody);
		wrapper.appendChild(table);
		return wrapper;
	}

	static renderSummaryRow(doc: DocStats, targetId: string): HTMLTableRowElement {
		const tr = document.createElement('tr');
		tr.style.cursor = 'pointer';
		tr.setAttribute('data-bs-toggle', 'collapse');
		tr.setAttribute('data-bs-target', `#${targetId}`);
		tr.setAttribute('aria-expanded', 'false');
		tr.setAttribute('aria-controls', targetId);

		const docCell = document.createElement('td');
		const icon = document.createElement('span');
		icon.className = 'me-2 text-muted';
		icon.textContent = '▸';
		docCell.appendChild(icon);
		docCell.appendChild(document.createTextNode(doc.source));
		tr.appendChild(docCell);

		const chunkCountCell = document.createElement('td');
		chunkCountCell.textContent = doc.chunkCount.toString();
		tr.appendChild(chunkCountCell);

		const charsCell = document.createElement('td');
		charsCell.textContent = doc.totalChars.toLocaleString();
		tr.appendChild(charsCell);

		const avgCell = document.createElement('td');
		avgCell.textContent = doc.avgChunkSize.toString();
		tr.appendChild(avgCell);

		return tr;
	}

	static renderDetailRow(doc: DocStats, targetId: string): HTMLTableRowElement {
		const tr = document.createElement('tr');
		const td = document.createElement('td');
		td.colSpan = 4;
		td.className = 'p-0 border-0';

		const collapse = document.createElement('div');
		collapse.id = targetId;
		collapse.className = 'collapse';

		const inner = document.createElement('div');
		inner.className = 'p-3 bg-body-tertiary border-bottom';

		for (const chunk of doc.chunks) {
			inner.appendChild(MainStats.renderChunk(chunk));
		}
		collapse.appendChild(inner);
		td.appendChild(collapse);
		tr.appendChild(td);
		return tr;
	}

	static renderChunk(chunk: Chunk): HTMLElement {
		const wrapper = document.createElement('div');
		wrapper.className = 'mb-3';

		const meta = document.createElement('div');
		meta.className = 'small text-muted mb-1';
		const idEl = document.createElement('code');
		idEl.textContent = chunk.id;
		meta.appendChild(idEl);
		meta.appendChild(
			document.createTextNode(` · offset ${chunk.offset} · ${chunk.text.length} chars`),
		);
		wrapper.appendChild(meta);

		const pre = document.createElement('pre');
		pre.className = 'small bg-white border rounded p-2 mb-0';
		pre.style.whiteSpace = 'pre-wrap';
		pre.style.maxHeight = '300px';
		pre.style.overflowY = 'auto';
		pre.textContent = chunk.text;
		wrapper.appendChild(pre);

		return wrapper;
	}
}

MainStats.run();
