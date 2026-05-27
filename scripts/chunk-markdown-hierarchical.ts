import Fs from 'node:fs';
import Path from 'node:path';
import NodeUrl from 'node:url';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { toString as mdastToString } from 'mdast-util-to-string';
import type { Root, RootContent } from 'mdast';

export type Parent = {
	id: string;
	source: string;
	headingPath: string[];
	text: string;
};

export type Child = {
	id: string;
	parentId: string;
	source: string;
	headingPath: string[];
	text: string;
	offset: number;
};

export type HierarchicalResult = {
	parents: Parent[];
	children: Child[];
};

const PARENT_MAX = 2000;
const CHILD_MAX = 400;
const CHILD_OVER = 80;
const DOCUMENTS_DIR = 'documents_original';

export class ChunkMarkdownHierarchical {
	static async chunkAll(): Promise<HierarchicalResult> {
		const docsDir = Path.resolve(process.cwd(), DOCUMENTS_DIR);
		const dirEntries = await Fs.promises.readdir(docsDir);
		const parents: Parent[] = [];
		const children: Child[] = [];
		for (const filename of dirEntries.sort()) {
			if (/\.md$/i.test(filename) === false) continue;
			const text = await Fs.promises.readFile(Path.join(docsDir, filename), 'utf-8');
			const part = ChunkMarkdownHierarchical.chunkText(text, filename);
			parents.push(...part.parents);
			children.push(...part.children);
		}
		return { parents, children };
	}

	static chunkText(source: string, sourceName: string): HierarchicalResult {
		const tree = unified().use(remarkParse).use(remarkGfm).parse(source) as Root;
		const parents = ChunkMarkdownHierarchical.buildParents(tree, source, sourceName);
		const children: Child[] = [];
		for (const parent of parents) {
			children.push(...ChunkMarkdownHierarchical.splitChildren(parent));
		}
		return { parents, children };
	}

	static buildParents(tree: Root, source: string, sourceName: string): Parent[] {
		const parents: Parent[] = [];
		const headingPath: string[] = [];
		let buffer: RootContent[] = [];
		let bufferChars = 0;
		let bufferPath: string[] = [];

		const sliceNode = (node: RootContent): string => {
			const p = node.position;
			if (p === undefined || p.start.offset === undefined || p.end.offset === undefined) {
				return '';
			}
			return source.slice(p.start.offset, p.end.offset);
		};

		const hasNonHeading = (): boolean => {
			for (const n of buffer) {
				if (n.type !== 'heading') return true;
			}
			return false;
		};

		const flush = (): void => {
			if (buffer.length === 0) return;
			if (hasNonHeading() === false) {
				buffer = [];
				bufferChars = 0;
				return;
			}
			const text = buffer.map(sliceNode).join('\n\n').trim();
			if (text.length === 0) {
				buffer = [];
				bufferChars = 0;
				return;
			}
			parents.push({
				id: `${sourceName}::p${parents.length}`,
				source: sourceName,
				headingPath: [...bufferPath],
				text,
			});
			buffer = [];
			bufferChars = 0;
		};

		for (const node of tree.children) {
			if (node.type === 'heading') {
				flush();
				const depth = node.depth;
				headingPath.length = depth - 1;
				headingPath[depth - 1] = mdastToString(node);
				bufferPath = [...headingPath];
				buffer.push(node);
				bufferChars += sliceNode(node).length;
				continue;
			}

			const nodeLen = sliceNode(node).length;

			if (bufferChars + nodeLen > PARENT_MAX && hasNonHeading() === true) {
				flush();
				bufferPath = [...headingPath];
			}

			if (buffer.length === 0) {
				bufferPath = [...headingPath];
			}

			buffer.push(node);
			bufferChars += nodeLen;
		}
		flush();
		return parents;
	}

	static splitChildren(parent: Parent): Child[] {
		const text = parent.text;
		if (text.length <= CHILD_MAX) {
			return [{
				id: `${parent.id}::c0`,
				parentId: parent.id,
				source: parent.source,
				headingPath: [...parent.headingPath],
				text: text.trim(),
				offset: 0,
			}];
		}

		const ranges = ChunkMarkdownHierarchical.protectedRanges(text);
		const children: Child[] = [];
		let i = 0;
		while (i < text.length) {
			const end = Math.min(i + CHILD_MAX, text.length);
			const cut = end === text.length
				? end - i
				: ChunkMarkdownHierarchical.findCut(text, i, end, ranges) - i;
			const sliceText = text.slice(i, i + cut).trim();
			if (sliceText.length > 0) {
				children.push({
					id: `${parent.id}::c${children.length}`,
					parentId: parent.id,
					source: parent.source,
					headingPath: [...parent.headingPath],
					text: sliceText,
					offset: i,
				});
			}
			if (i + cut >= text.length) break;
			i += Math.max(1, cut - CHILD_OVER);
		}
		return children;
	}

	static findCut(text: string, start: number, end: number, ranges: Array<[number, number]>): number {
		const min = start + Math.floor(CHILD_MAX / 2);
		const separators = ['\n\n', '. ', ' '];
		for (const sep of separators) {
			let pos = text.lastIndexOf(sep, end - 1);
			while (pos >= min) {
				const cut = pos + sep.length;
				if (cut <= end && ChunkMarkdownHierarchical.inProtected(cut, ranges) === false) {
					return cut;
				}
				pos = text.lastIndexOf(sep, pos - 1);
			}
		}
		return end;
	}

	static inProtected(pos: number, ranges: Array<[number, number]>): boolean {
		for (const [s, e] of ranges) {
			if (pos >= s && pos < e) return true;
		}
		return false;
	}

	static protectedRanges(text: string): Array<[number, number]> {
		const ranges: Array<[number, number]> = [];
		const lines = text.split('\n');
		let offset = 0;
		let inFence: string | null = null;
		let fenceStart = 0;
		let tableStart = -1;

		for (let i = 0; i < lines.length; i += 1) {
			const line = lines[i];
			const lineStart = offset;
			const lineEndIncl = offset + line.length + 1;

			if (inFence !== null) {
				const closeRe = new RegExp('^\\s*' + inFence + '\\s*$');
				if (closeRe.test(line) === true) {
					ranges.push([fenceStart, lineEndIncl]);
					inFence = null;
				}
			} else {
				const fenceM = line.match(/^\s*(```|~~~)/);
				if (fenceM !== null) {
					inFence = fenceM[1];
					fenceStart = lineStart;
				} else if (/^\s*\|/.test(line) === true) {
					if (tableStart < 0) tableStart = lineStart;
				} else if (tableStart >= 0) {
					ranges.push([tableStart, lineStart]);
					tableStart = -1;
				}
			}
			offset = lineEndIncl;
		}
		if (inFence !== null) ranges.push([fenceStart, offset]);
		if (tableStart >= 0) ranges.push([tableStart, offset]);
		return ranges;
	}
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

if (process.argv[1] === NodeUrl.fileURLToPath(import.meta.url)) {
	const result = await ChunkMarkdownHierarchical.chunkAll();
	console.log(JSON.stringify(result, null, 2));
	console.error(
		`chunked ${result.parents.length} parents / ${result.children.length} children from ${DOCUMENTS_DIR}/`,
	);
}
