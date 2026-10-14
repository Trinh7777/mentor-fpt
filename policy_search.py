"""BƯỚC 3 - Tìm quy chế trong FPT.json (RAG nhẹ, không cần vector DB).
Chuẩn hóa bỏ dấu tiếng Việt rồi chấm điểm theo tag/tiêu đề/nội dung."""
import re
import unicodedata
from data_loader import load_all

STOPWORDS = {"la", "cua", "va", "co", "khong", "the", "nao", "bao", "nhieu", "toi", "minh",
             "em", "ban", "duoc", "bi", "thi", "o", "tai", "cho", "voi", "de", "khi", "nhu",
             "gi", "sao", "hay", "thu", "mot", "cac", "nhung"}


def normalize(text: str) -> str:
    text = text.lower().replace("đ", "d")
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", text)


def _tokens(text):
    return [t for t in re.findall(r"[a-z0-9]+", normalize(text)) if t not in STOPWORDS and len(t) > 1]


def search_policy(query: str, top_k: int = 3):
    chunks = load_all()["policy"]
    q_tokens = _tokens(query)
    q_norm = normalize(query)
    scored = []
    for c in chunks:
        tags_norm = [normalize(t) for t in c["tags"]]
        title_norm = normalize(c["title"])
        content_norm = normalize(c["content"])
        score = 0.0
        for tag in tags_norm:                       # cụm tag xuất hiện nguyên trong câu hỏi -> điểm cao
            if tag in q_norm:
                score += 6
        for t in q_tokens:
            if any(t in tag.split() for tag in tags_norm):
                score += 3
            if t in title_norm:
                score += 2
            score += min(content_norm.count(t), 3) * 0.7
        if score > 0:
            scored.append((score, c))
    scored.sort(key=lambda x: -x[0])
    return [{"chunk_id": c["chunk_id"], "title": c["title"], "category": c["category"],
             "content": c["content"], "score": round(s, 1)} for s, c in scored[:top_k]]
