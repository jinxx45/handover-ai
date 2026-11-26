"""Lexical retrieval (BM25) over the handover pack, interview answers and evidence.

BM25 needs no embedding model or vector DB, so the demo runs fully offline. The
interface (`Chunk`, `search`) is small on purpose: swapping in pgvector later
only means replacing `search`.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from rank_bm25 import BM25Okapi

from .models import Answer, Evidence, KnowledgePack

_TOKEN = re.compile(r"[a-z0-9]+")
_STOP = {
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are", "was", "it", "this", "that",
    "what", "how", "who", "when", "where", "why", "do", "does", "i", "we", "you", "should", "with", "at", "be",
    "my", "our", "get", "can", "if", "from", "by", "as", "about", "which",
}


def tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN.findall(text.lower()) if t not in _STOP]


@dataclass
class Chunk:
    id: str  # citation id: S1 (pack section), I1 (interview answer), E1 (evidence)
    label: str
    text: str


def build_chunks(pack: KnowledgePack | None, answers: list[Answer], evidence: list[Evidence]) -> list[Chunk]:
    chunks: list[Chunk] = []
    if pack:
        for idx, s in enumerate(pack.sections, start=1):
            chunks.append(Chunk(id=f"S{idx}", label=s.heading, text=f"{s.heading}. {s.body}"))
    for a in answers:
        chunks.append(Chunk(id=a.id, label="Interview", text=f"Q: {a.question} A: {a.answer}"))
    for e in evidence:
        chunks.append(Chunk(id=e.id, label=e.source, text=e.text))
    return chunks


def search(question: str, chunks: list[Chunk], k: int = 5) -> list[tuple[Chunk, float]]:
    if not chunks:
        return []
    corpus = [tokenize(c.text) or ["_empty_"] for c in chunks]
    bm25 = BM25Okapi(corpus)
    q = tokenize(question)
    if not q:
        return []
    scores = bm25.get_scores(q)
    ranked = sorted(zip(chunks, scores), key=lambda x: x[1], reverse=True)
    # Keep only chunks sharing at least one query term; BM25 can score 0 or negative otherwise.
    qset = set(q)
    hits = [(c, float(s)) for c, s in ranked if qset & set(tokenize(c.text))]
    return hits[:k]
