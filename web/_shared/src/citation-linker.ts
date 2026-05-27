const CITATION_RE = /\(source:\s*([^)]+\.md)\)/g;

export class CitationLinker {
	static render(
		container: HTMLElement,
		text: string,
		knownSources: Set<string>,
	): void {
		container.replaceChildren();
		let cursor = 0;
		for (const match of text.matchAll(CITATION_RE)) {
			const matchStart = match.index;
			const matchEnd = matchStart + match[0].length;
			if (matchStart > cursor) {
				container.appendChild(
					document.createTextNode(text.slice(cursor, matchStart)),
				);
			}
			const filename = match[1].trim();
			if (knownSources.has(filename) === true) {
				container.appendChild(CitationLinker.buildAnchor(filename, match[0]));
			} else {
				container.appendChild(document.createTextNode(match[0]));
			}
			cursor = matchEnd;
		}
		if (cursor < text.length) {
			container.appendChild(document.createTextNode(text.slice(cursor)));
		}
	}

	static linkInPlace(container: HTMLElement, knownSources: Set<string>): void {
		const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
		const textNodes: Text[] = [];
		for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
			textNodes.push(node as Text);
		}
		for (const textNode of textNodes) {
			if (textNode.parentElement?.closest('a') !== null) continue;
			const text = textNode.nodeValue ?? '';
			const matches = [...text.matchAll(CITATION_RE)];
			if (matches.length === 0) continue;
			const frag = document.createDocumentFragment();
			let cursor = 0;
			for (const match of matches) {
				const matchStart = match.index;
				const matchEnd = matchStart + match[0].length;
				if (matchStart > cursor) {
					frag.appendChild(
						document.createTextNode(text.slice(cursor, matchStart)),
					);
				}
				const filename = match[1].trim();
				if (knownSources.has(filename) === true) {
					frag.appendChild(CitationLinker.buildAnchor(filename, match[0]));
				} else {
					frag.appendChild(document.createTextNode(match[0]));
				}
				cursor = matchEnd;
			}
			if (cursor < text.length) {
				frag.appendChild(document.createTextNode(text.slice(cursor)));
			}
			textNode.replaceWith(frag);
		}
	}

	private static buildAnchor(filename: string, linkText: string): HTMLAnchorElement {
		const anchor = document.createElement('a');
		anchor.href = `/documents_original/${encodeURIComponent(filename)}`;
		anchor.target = '_blank';
		anchor.rel = 'noopener';
		anchor.textContent = linkText;
		return anchor;
	}
}
