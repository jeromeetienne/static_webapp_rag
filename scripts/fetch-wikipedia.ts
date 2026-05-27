import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';

/** A Wikipedia article fetched from the API: display title, canonical URL, and plain-text body. */
export type WikiArticle = {
	title: string;
	url: string;
	body: string;
};

type OpenSearchResponse = [string, string[], string[], string[]];

type ExtractsResponse = {
	query?: {
		pages?: Record<string, {
			pageid?: number;
			title?: string;
			extract?: string;
			missing?: string;
		}>;
	};
};

const DOCUMENTS_DIR = 'web/public/documents_original';
const USER_AGENT = 'static-webapp-rag/0.0.1 (https://github.com/jeromeetienne/static_webapp_rag)';

/** CLI that searches Wikipedia and writes matching articles as markdown into the output directory. */
export class FetchWikipedia {
	/**
	 * Entry point: parses CLI arguments from `process.argv`, searches Wikipedia, fetches each
	 * matching article, and writes them as markdown files. Progress is logged to stderr.
	 */
	static async run(): Promise<void> {
		const program = new Command();
		program
			.name('fetch-wikipedia')
			.description('Search Wikipedia and download articles as markdown into web/public/documents_original/')
			.argument('<query...>', 'search terms (joined with spaces)')
			.option('-n, --limit <number>', 'number of articles to fetch', '5')
			.option('-l, --lang <code>', 'Wikipedia language code', 'en')
			.option('-o, --output <dir>', 'output directory', DOCUMENTS_DIR)
			.option('-f, --force', 'overwrite existing files', false)
			.parse(process.argv);

		const opts = program.opts<{ limit: string; lang: string; output: string; force: boolean }>();
		const query = program.args.join(' ');
		const limit = Number.parseInt(opts.limit, 10);
		if (Number.isNaN(limit) === true || limit <= 0) {
			throw new Error(`invalid --limit: ${opts.limit}`);
		}

		const outDir = path.resolve(process.cwd(), opts.output);
		await fs.mkdir(outDir, { recursive: true });

		console.error(`searching Wikipedia (${opts.lang}) for: ${query}`);
		const titles = await FetchWikipedia.search(query, limit, opts.lang);
		if (titles.length === 0) {
			console.error('no results');
			return;
		}
		console.error(`found ${titles.length} result(s): ${titles.join(', ')}`);

		let written = 0;
		let skipped = 0;
		for (const title of titles) {
			const slug = FetchWikipedia.slugify(title);
			const filePath = path.join(outDir, `${slug}.md`);
			if (opts.force === false && await FetchWikipedia.exists(filePath) === true) {
				console.error(`skipping (already exists): ${path.relative(process.cwd(), filePath)}`);
				skipped++;
				continue;
			}
			const article = await FetchWikipedia.fetchArticle(title, opts.lang);
			if (article === null) {
				console.error(`skipping (no extract): ${title}`);
				skipped++;
				continue;
			}
			const md = FetchWikipedia.toMarkdown(article);
			await fs.writeFile(filePath, md, 'utf-8');
			console.error(`wrote: ${path.relative(process.cwd(), filePath)} (${md.length} chars)`);
			written++;
		}
		console.error(`done — ${written} written, ${skipped} skipped`);
	}

	/**
	 * Queries Wikipedia's OpenSearch API for article titles matching the query.
	 * @param query - free-text search terms
	 * @param limit - maximum number of titles to return
	 * @param lang - Wikipedia language code (e.g. `en`, `fr`)
	 * @returns matched article titles, in Wikipedia's relevance order
	 */
	static async search(query: string, limit: number, lang: string): Promise<string[]> {
		const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
		url.searchParams.set('action', 'opensearch');
		url.searchParams.set('search', query);
		url.searchParams.set('limit', String(limit));
		url.searchParams.set('namespace', '0');
		url.searchParams.set('format', 'json');
		const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
		if (res.ok === false) {
			throw new Error(`opensearch failed: ${res.status} ${res.statusText}`);
		}
		const data = await res.json() as OpenSearchResponse;
		return data[1];
	}

	/**
	 * Fetches the plain-text extract for a single article via the `extracts` API and resolves
	 * redirects to the canonical title.
	 * @param title - article title to fetch
	 * @param lang - Wikipedia language code
	 * @returns the article, or `null` if the page is missing or has an empty extract
	 */
	static async fetchArticle(title: string, lang: string): Promise<WikiArticle | null> {
		const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
		url.searchParams.set('action', 'query');
		url.searchParams.set('prop', 'extracts');
		url.searchParams.set('titles', title);
		url.searchParams.set('format', 'json');
		url.searchParams.set('explaintext', '1');
		url.searchParams.set('exsectionformat', 'wiki');
		url.searchParams.set('redirects', '1');
		const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
		if (res.ok === false) {
			throw new Error(`extracts failed for ${title}: ${res.status} ${res.statusText}`);
		}
		const data = await res.json() as ExtractsResponse;
		const pages = data.query?.pages;
		if (pages === undefined) return null;
		const page = Object.values(pages)[0];
		if (page === undefined || page.missing !== undefined) return null;
		const extract = page.extract;
		if (extract === undefined || extract.trim().length === 0) return null;
		const resolvedTitle = page.title ?? title;
		const wikiUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(resolvedTitle).replace(/%20/g, '_')}`;
		return { title: resolvedTitle, url: wikiUrl, body: extract };
	}

	/**
	 * Converts a `WikiArticle` to markdown by mapping Wikipedia's `==`-style headings to `#`-style
	 * and prepending a top-level title and source URL.
	 */
	static toMarkdown(article: WikiArticle): string {
		const converted = article.body
			.replace(/^======\s*(.*?)\s*======$/gm, '###### $1')
			.replace(/^=====\s*(.*?)\s*=====$/gm, '##### $1')
			.replace(/^====\s*(.*?)\s*====$/gm, '#### $1')
			.replace(/^===\s*(.*?)\s*===$/gm, '### $1')
			.replace(/^==\s*(.*?)\s*==$/gm, '## $1');
		return `# ${article.title}\n\nSource: ${article.url}\n\n${converted.trim()}\n`;
	}

	/**
	 * Converts an article title to a filesystem-safe kebab-case slug: lowercased, diacritics
	 * stripped, and runs of non-alphanumerics collapsed to a single `-`.
	 */
	static slugify(title: string): string {
		return title
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[̀-ͯ]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');
	}

	/** Returns whether a file exists at the given path (wraps `fs.access`). */
	static async exists(filePath: string): Promise<boolean> {
		try {
			await fs.access(filePath);
			return true;
		} catch {
			return false;
		}
	}
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly === true) {
	FetchWikipedia.run().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
