# static_webapp_rag

A purely static web app that answers questions about a fixed document set using retrieval-augmented generation — **no backend at runtime**. Documents are chunked and embedded once at build time; the browser handles query embedding, vector search, and LLM inference locally via WebGPU.

**Live demo:** https://jeromeetienne.github.io/static_webapp_rag/

## How it works

```
┌──────────────────────────┐         ┌──────────────────────────────┐
│ BUILD-TIME (Node)        │         │ RUNTIME (Browser)            │
│                          │         │                              │
│  documents_original/*.md │         │  user question               │
│    │                     │         │    │                         │
│    ▼                     │         │    ▼                         │
│  chunk + embed           │  ====>  │  embed query (same model)    │
│  (MiniLM-L6-v2)          │         │    │                         │
│    │                     │         │    ▼                         │
│    ▼                     │         │  cosine top-K vs static idx  │
│  chunks.json             │         │    │                         │
│  embeddings.bin          │         │    ▼                         │
│  meta.json               │         │  prompt LLM (WebLLM, WebGPU) │
│                          │         │    │                         │
│  → web/public/documents_encoded/      │         │    ▼                         │
│                          │         │  streamed answer in UI       │
└──────────────────────────┘         └──────────────────────────────┘
```

Same embedding model on both sides (`Xenova/all-MiniLM-L6-v2`, 384-dim) — vectors stay consistent. Retrieval is a plain cosine-similarity loop over a `Float32Array`; for tens of thousands of chunks this is fine without HNSW.

## Stack

| Concern | Library |
|---|---|
| Bundler / dev server | [Vite](https://vitejs.dev) + TypeScript |
| Embeddings (Node + browser) | [`@huggingface/transformers`](https://github.com/huggingface/transformers.js) running `Xenova/all-MiniLM-L6-v2` |
| LLM (browser only) | [`@mlc-ai/web-llm`](https://github.com/mlc-ai/web-llm) with `Llama-3.2-3B-Instruct-q4f16_1-MLC` |
| Landing page | Bootstrap 5.3 via CDN |
| Deploy | [`gh-pages`](https://github.com/tschaub/gh-pages) → GitHub Pages |

## Requirements

- Node 20.11+ (for `import.meta.dirname`)
- A WebGPU-capable browser (Chrome / Edge 113+, recent Firefox Nightly, Safari TP)
- ~2 GB free disk in the browser on first chat use (Llama 3.2 3B weights are cached after the first download)

## Quickstart

```sh
npm install
npm run build-index     # chunk + embed documents_original/ → web/public/documents_encoded/
npm run dev             # http://localhost:5173
```

Open the landing page, click **Try the chat**, ask a question. First query downloads the embedding model (~25 MB) and then the LLM (~1.8 GB) — both are cached in the browser afterwards.

## Customizing

### Adding your own documents

Drop `.md` or `.txt` files into [documents_original/](documents_original/) and rerun:

```sh
npm run build-index
```

Refresh the page; Vite serves `web/public/documents_encoded/` directly, no rebuild step needed.

### Tweaking chunking

Constants live at the top of [scripts/chunk-docs.ts](scripts/chunk-docs.ts):

```ts
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;
```

Splitter is sentence/paragraph-aware — see `ChunkDocs.findBoundary`.

### Changing the LLM

Default model is set in [web/src/llm.ts](web/src/llm.ts):

```ts
export const DEFAULT_MODEL = 'Llama-3.2-3B-Instruct-q4f16_1-MLC';
export const SMALL_MODEL   = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
export const MOBILE_MODEL  = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
```

`SMALL_MODEL` (~0.7 GB) is a low-VRAM fallback. `MOBILE_MODEL` (~0.35 GB) is auto-selected on phones via a userAgent check in [web/src/device.ts](web/src/device.ts) — the 3B default would otherwise blow past WebGPU memory limits on most mobile chipsets. The full list of supported MLC models lives in `prebuiltAppConfig.model_list` in the [WebLLM repo](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts).

## Project layout

```
documents_original/      # source docs (input to build-index)
scripts/
  chunk-docs.ts          # CLI: print chunks (debugging)
  build-index.ts         # CLI: chunk + embed → web/public/documents_encoded/
web/                     # everything browser
  index.html             # landing page (Bootstrap)
  chat_basic/index.html  # bare-bones chat UI (hand-rolled)
  chat_pro/index.html    # polished chat UI (deep-chat web component)
  src/
    main.ts              # chat_basic entry, wires retrieve → generate
    main-pro.ts          # chat_pro entry, same pipeline behind <deep-chat>
    index-loader.ts      # fetch chunks.json / embeddings.bin
    query-embedder.ts    # lazy-loads MiniLM in browser
    retriever.ts         # cosine top-K
    llm.ts               # wraps @mlc-ai/web-llm
  public/documents_encoded/   # generated; gitignored
vite.config.ts           # root: 'web', multi-page input
```

## Deploying

This repo deploys to GitHub Pages via the `gh-pages` package:

```sh
npm run deploy
```

That runs `predeploy` (re-embeds docs, builds with `--base=/static_webapp_rag/`) then pushes `dist/` to the `gh-pages` branch. After the first run, enable Pages once in repo Settings → Pages → Source: **Deploy from a branch** → `gh-pages` / `/ (root)`.

## Notes / known limitations

- WebGPU is required for in-browser LLM inference. Browsers without it can still see the landing page but the chat will fail to initialize.
- GitHub Pages can't set COOP/COEP headers, so transformers.js falls back to the non-threaded ONNX runtime in production. Slightly slower; functionally identical.
- The whole vector index is loaded eagerly. Fine up to a few thousand chunks; past ~50 k chunks you'd want sharding or int8 quantization.
