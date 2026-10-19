"""BƯỚC 3 - Tìm quy chế trong FPT.json bằng Hybrid Search (BM25 + Mở rộng từ đồng nghĩa + Semantic Vector Embedding).
Vừa chạy siêu nhanh khi offline, vừa hiểu ngữ nghĩa sâu (Deep Learning / Embedding) khi có API key."""
import json
import math
import os
import re
import unicodedata
from pathlib import Path
from data_loader import load_all
from config import DATA_DIR

STOPWORDS = {"la", "cua", "va", "co", "khong", "the", "nao", "bao", "nhieu", "toi", "minh",
             "em", "ban", "duoc", "bi", "thi", "o", "tai", "cho", "voi", "de", "khi", "nhu",
             "gi", "sao", "hay", "thu", "mot", "cac", "nhung", "cung", "ra", "vao", "len"}

# Từ điển đồng nghĩa thực tế của sinh viên FPT -> thuật ngữ quy chế chính thức
SYNONYM_MAP = {
    "bung hoc": "vang mat cam thi attendance fail",
    "cup hoc": "vang mat cam thi attendance fail",
    "nghi hoc": "vang mat tam ngung hoc bao luu thoi hoc",
    "rot mon": "truot mon hoc lai",
    "no mon": "truot mon hoc lai",
    "tach mon": "truot mon hoc lai",
    "hoc cai thien": "hoc lai som",
    "di thuc tap": "ojt on the job training thuc tap doanh nghiep",
    "do an": "khoa luan tot nghiep kltn",
    "lam luan van": "khoa luan tot nghiep kltn",
    "ra truong": "xet tot nghiep bang tot nghiep",
    "duoi hoc": "buoc thoi hoc ky luat",
    "dinh chi": "tam ngung dinh chi hoc tap ky luat",
    "quay cop": "gian lan thi ky luat thi",
    "phao thi": "gian lan thi mang tai lieu",
    "cham lai": "phuc khao khieu nai diem",
    "cham diem sai": "phuc khao khieu nai diem",
    "doi nganh": "chuyen nganh chuyen co so",
    "chuyen truong": "chuyen co so",
    "mat sach": "boi thuong sach thu vien",
    "muon sach": "thu vien tra sach muon",
    "hut pod": "hut thuoc la vape ky luat sinh vien",
    "di tre": "vao lop muon 5 phut",
    "di muon": "vao lop muon 5 phut",
}

EMBED_CACHE_FILE = DATA_DIR / "policy_embeddings.json"


def normalize(text: str) -> str:
    text = text.lower().replace("đ", "d")
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", text).strip()


def expand_query(norm_q: str) -> str:
    extra = []
    for slang, official in SYNONYM_MAP.items():
        if slang in norm_q:
            extra.append(official)
    return norm_q + (" " + " ".join(extra) if extra else "")


def _tokens(text):
    return [t for t in re.findall(r"[a-z0-9]+", normalize(text)) if t not in STOPWORDS and len(t) > 1]


def _cosine_sim(v1: list, v2: list) -> float:
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot = sum(a * b for a, b in zip(v1, v2))
    n1 = math.sqrt(sum(a * a for a in v1))
    n2 = math.sqrt(sum(b * b for b in v2))
    return dot / (n1 * n2) if n1 > 0 and n2 > 0 else 0.0


def _get_semantic_scores(query: str, chunks: list) -> dict:
    """Tính điểm tương đồng ngữ nghĩa bằng Gemini Embedding (có cache xuống file JSON)."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        try:
            import streamlit as st
            api_key = st.secrets.get("GEMINI_API_KEY", "")
        except Exception:
            api_key = ""
    if not api_key:
        return {}

    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        embed_model = "gemini-embedding-001"

        # Đọc hoặc tạo cache embedding cho các chunk quy chế
        cache = {}
        if EMBED_CACHE_FILE.exists():
            try:
                with open(EMBED_CACHE_FILE, encoding="utf-8") as f:
                    cache = json.load(f)
            except Exception:
                cache = {}

        missing_chunks = [c for c in chunks if c["chunk_id"] not in cache]
        if missing_chunks:
            texts = [f"{c['title']}. {c['category']}. Tags: {', '.join(c['tags'])}. {c['content']}" for c in missing_chunks]
            res = client.models.embed_content(model=embed_model, contents=texts)
            for c, emb in zip(missing_chunks, res.embeddings):
                cache[c["chunk_id"]] = emb.values
            try:
                with open(EMBED_CACHE_FILE, "w", encoding="utf-8") as f:
                    json.dump(cache, f)
            except Exception:
                pass

        q_res = client.models.embed_content(model=embed_model, contents=[query])
        q_vec = q_res.embeddings[0].values
        return {c["chunk_id"]: _cosine_sim(q_vec, cache.get(c["chunk_id"], [])) for c in chunks}
    except Exception:
        return {}


def search_policy(query: str, top_k: int = 3):
    chunks = load_all()["policy"]
    q_norm = expand_query(normalize(query))
    q_tokens = _tokens(q_norm)

    # Tính IDF cho từng token trên tập tài liệu (BM25-lite)
    N = max(len(chunks), 1)
    doc_tokens_list = []
    df = {}
    for c in chunks:
        full_text = f"{c['title']} {' '.join(c['tags'])} {c['content']}"
        d_toks = set(_tokens(full_text))
        doc_tokens_list.append(d_toks)
        for t in d_toks:
            df[t] = df.get(t, 0) + 1

    sem_scores = _get_semantic_scores(query, chunks)

    scored = []
    for c in chunks:
        tags_norm = [normalize(t) for t in c["tags"]]
        title_norm = normalize(c["title"])
        content_norm = normalize(c["content"])
        score = 0.0

        # 1. Điểm khớp cụm tag chính xác
        for tag in tags_norm:
            if tag in q_norm:
                score += 6.5

        # 2. Điểm BM25 / TF-IDF theo từng từ khóa
        for t in q_tokens:
            idf = math.log(1 + (N - df.get(t, 0) + 0.5) / (df.get(t, 0) + 0.5))
            if any(t in tag.split() for tag in tags_norm):
                score += 3.0 * max(idf, 0.8)
            if t in title_norm:
                score += 2.2 * max(idf, 0.8)
            tf = min(content_norm.count(t), 4)
            score += tf * 0.7 * max(idf, 0.5)

        # 3. Kết hợp điểm Semantic Vector Embedding (Hybrid RRF/Weighted)
        sem = sem_scores.get(c["chunk_id"], 0.0)
        if sem > 0.55:
            score += (sem - 0.50) * 25.0

        if score > 0:
            scored.append((score, sem, c))

    scored.sort(key=lambda x: -x[0])
    return [{
        "chunk_id": c["chunk_id"],
        "title": c["title"],
        "category": c["category"],
        "content": c["content"],
        "score": round(s, 2),
        "semantic_similarity": round(sem, 3) if sem else None
    } for s, sem, c in scored[:top_k]]

