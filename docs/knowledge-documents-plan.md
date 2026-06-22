# Knowledge Documents Plan

Knowledge Documents already exists in a light form:

- UI: `web/src/pages/Personas.tsx` and `web/src/pages/Settings.tsx` let users add pasted snippets and import PDF/DOCX/TXT files.
- API: `server/src/routes/settings.ts` extracts PDF text through Gemini/OpenRouter at `POST /settings/knowledge/import`.
- Storage: `user_settings.knowledge_documents` keeps documents as JSON.
- Generation: `server/src/services/generate-content.ts` sends up to 4 truncated documents into every prompt when `knowledge_base_enabled` is on.

That is useful, but it is not the Byword-style flow yet. It has no processing status, no chunks, no embeddings, and no topic-based retrieval.

## Goal

Teach the app factual business context without mixing it with voice training.

1. Upload PDF, DOCX, or TXT.
2. Process it into searchable chunks.
3. Retrieve only chunks relevant to the article topic.
4. Add those facts naturally to generation prompts.

## MVP Upgrade

Ship this before adding a vector database.

1. Add document metadata to saved JSON:

```ts
{
  id: string;
  title: string;
  content: string;
  status: "processing" | "ready" | "failed";
  chunks: Array<{ id: string; text: string }>;
  createdAt: string;
  error?: string;
}
```

2. Chunk imported and pasted content with a plain function:

- Split by headings/blank lines first.
- Merge tiny sections.
- Keep chunks around 800-1200 chars.
- Cap total stored text per document at the existing 30k char limit.

3. Replace `summarizeKnowledgeDocuments` with keyword retrieval:

- Tokenize the article title, keyword, outline, and source text.
- Score each ready chunk by token overlap.
- Send the best 6 chunks to the model.
- Keep the current toggle: if `knowledge_base_enabled` is false, retrieve nothing.

4. Improve UI copy and stats:

- Rename "Knowledge Base" to "Knowledge Documents".
- Show document count and chunk count.
- Show `Processing`, `Ready`, or `Failed`.
- Auto-enable retrieval after the first successful upload.
- Keep delete as the only management action for now.

5. Keep uploads boring:

- TXT/DOCX extraction can stay client-side for now.
- PDF extraction can stay in `POST /settings/knowledge/import`.
- Do not add object storage until users need original-file downloads.

## Later

Add real embeddings only after keyword retrieval is obviously weak.

- New tables: `knowledge_documents`, `knowledge_chunks`.
- Store embedding vectors per chunk.
- Add provider-backed embedding generation.
- Retrieve top chunks by vector similarity plus keyword fallback.
- Move processing to a background job if imports regularly exceed request time.

## Files To Touch First

- `web/src/pages/Personas.tsx`: upload UI, status badges, chunk count.
- `web/src/pages/Settings.tsx`: mirror the same settings UI or remove duplicate knowledge editing from one page.
- `server/src/routes/settings.ts`: return chunks/status from import.
- `server/src/services/generate-content.ts`: retrieve relevant chunks instead of summarizing whole docs.
- `server/src/services/knowledge.ts`: one small helper file for chunking, tokenizing, and retrieval.
- `server/src/services/knowledge.self-test.ts`: assert chunking and retrieval choose the relevant chunk.

## Skip For Now

- Per-article document picker.
- Folders/tags.
- Version history.
- Original file downloads.
- Separate admin page.
- New dependencies.
- Vector database.

Those add surface area before the current retrieval gap is fixed.
