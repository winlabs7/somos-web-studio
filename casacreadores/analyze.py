"""Score a creator for La Casa de los Creadores using Scrape Creators."""
from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://api.scrapecreators.com"
CO_WORDS = (
    "colombia", "colombian", "colombiano", "colombiana", "medellín", "medellin",
    "bogotá", "bogota", "cali", "barranquilla", "cartagena", "bucaramanga",
    "pereira", "manizales", "cúcuta", "cucuta", "antioquia", "valle del cauca",
    "laureles", "envigado", "itagüí", "itagui", "rionegro", "santa marta",
)
LATAM_WORDS = (
    "méxico", "mexico", "cdmx", "argentina", "chile", "perú", "peru", "lima",
    "ecuador", "venezuela", "latam", "latino", "latina", "españa", "spain",
)

def _key() -> str:
    return os.environ.get("SCRAPECREATORS_API_KEY") or os.environ.get("SCRAPE_CREATORS_API_KEY") or ""


def _get(path: str, params: dict) -> dict:
    q = dict(params)
    q.setdefault("cache_max_age", "7d")
    url = API + path + "?" + urllib.parse.urlencode({k: v for k, v in q.items() if v})
    req = urllib.request.Request(
        url,
        headers={"x-api-key": _key(), "User-Agent": "casacreadores-fit"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:400]
        return {"success": False, "status": e.code, "error": body}
    except Exception as e:
        return {"success": False, "error": type(e).__name__}


def parse_handles(raw: str) -> list[tuple[str, str]]:
    """Return [(platform, handle), ...] from a messy interview string."""
    if not raw:
        return []
    text = raw.strip()
    found: list[tuple[str, str]] = []
    seen = set()

    def add(platform: str, handle: str):
        h = handle.strip().lstrip("@").split("?")[0].strip("/").lower()
        h = h.split("/")[0]
        if not h or len(h) > 40:
            return
        key = (platform, h)
        if key in seen:
            return
        seen.add(key)
        found.append(key)

    for m in re.finditer(r"(https?://[^\s,;]+)|(www\.[^\s,;]+)", text, re.I):
        url = m.group(0)
        if "instagram.com" in url:
            add("instagram", url.split("instagram.com/")[-1])
        elif "tiktok.com" in url:
            add("tiktok", url.split("tiktok.com/")[-1].lstrip("@"))
        elif "youtube.com" in url or "youtu.be" in url:
            add("youtube", url)
        elif "kick.com" in url:
            add("kick", url.split("kick.com/")[-1])

    tagged = re.findall(r"@([A-Za-z0-9._]+)", text)
    lower = text.lower()
    if "tiktok" in lower:
        for h in tagged:
            add("tiktok", h)
    if "instagram" in lower or " insta" in lower or lower.startswith("ig"):
        for h in tagged:
            add("instagram", h)
    if "youtube" in lower or "youtu" in lower:
        for h in tagged:
            add("youtube", h)
    if not found and tagged:
        add("instagram", tagged[0])
    if not found:
        token = re.sub(r"[^A-Za-z0-9._]", "", text.split()[0] if text else "")
        if token:
            add("instagram", token)
    return found[:3]


def _ig_profile(handle: str) -> dict:
    data = _get("/v1/instagram/profile", {"handle": handle, "trim": "true"})
    user = ((data.get("data") or {}).get("user")) or {}
    if not user and not data.get("success", True):
        return {"platform": "instagram", "handle": handle, "ok": False, "error": data.get("error") or data.get("status")}
    if not user:
        return {"platform": "instagram", "handle": handle, "ok": False, "error": "empty"}
    followers = ((user.get("edge_followed_by") or {}).get("count")) or 0
    media = (user.get("edge_owner_to_timeline_media") or {}).get("edges") or []
    likes = []
    videos = 0
    for edge in media:
        node = edge.get("node") or {}
        likes.append(((node.get("edge_liked_by") or node.get("edge_media_preview_like") or {}).get("count")) or 0)
        if node.get("is_video") or node.get("product_type") == "clips":
            videos += 1
    avg_likes = sum(likes) / len(likes) if likes else 0
    eng = (avg_likes / followers) if followers else 0
    addr = user.get("business_address_json") or ""
    return {
        "platform": "instagram",
        "handle": user.get("username") or handle,
        "ok": True,
        "name": user.get("full_name"),
        "bio": user.get("biography") or "",
        "followers": followers,
        "following": ((user.get("edge_follow") or {}).get("count")) or 0,
        "posts": ((user.get("edge_owner_to_timeline_media") or {}).get("count")) or 0,
        "private": bool(user.get("is_private")),
        "verified": bool(user.get("is_verified")),
        "engagement": round(eng, 4),
        "avg_likes": round(avg_likes),
        "recent_videos": videos,
        "location_text": addr,
        "url": f"https://instagram.com/{user.get('username') or handle}",
    }


def _tt_profile(handle: str) -> dict:
    data = _get("/v1/tiktok/profile", {"handle": handle})
    user = data.get("user") or {}
    stats = data.get("stats") or {}
    if not user:
        return {"platform": "tiktok", "handle": handle, "ok": False, "error": data.get("error") or data.get("status")}
    followers = stats.get("followerCount") or 0
    videos = stats.get("videoCount") or 0
    hearts = stats.get("heartCount") or stats.get("heart") or 0
    avg = (hearts / videos) if videos else 0
    eng = (avg / followers) if followers else 0
    return {
        "platform": "tiktok",
        "handle": user.get("uniqueId") or handle,
        "ok": True,
        "name": user.get("nickname"),
        "bio": user.get("signature") or "",
        "followers": followers,
        "following": stats.get("followingCount") or 0,
        "posts": videos,
        "private": bool(user.get("privateAccount")),
        "verified": bool(user.get("verified")),
        "engagement": round(eng, 4),
        "avg_likes": round(avg),
        "recent_videos": videos,
        "location_text": "",
        "url": f"https://tiktok.com/@{user.get('uniqueId') or handle}",
    }


def _yt_profile(handle_or_url: str) -> dict:
    params = {"url": handle_or_url} if "youtube" in handle_or_url else {"handle": handle_or_url.lstrip("@")}
    data = _get("/v1/youtube/channel", params)
    if not data.get("channelId") and not data.get("name"):
        return {"platform": "youtube", "handle": handle_or_url, "ok": False, "error": data.get("error") or data.get("status")}
    subs = data.get("subscriberCount") or 0
    return {
        "platform": "youtube",
        "handle": data.get("channel") or handle_or_url,
        "ok": True,
        "name": data.get("name"),
        "bio": data.get("description") or "",
        "followers": subs,
        "following": 0,
        "posts": 0,
        "private": False,
        "verified": False,
        "engagement": 0,
        "avg_likes": 0,
        "recent_videos": 0,
        "location_text": data.get("country") or "",
        "url": data.get("channel") or handle_or_url,
    }


def _audience_points(n: int) -> tuple[int, str]:
    if n < 5000:
        return 0, "muy pequeño para la casa"
    if n < 20000:
        return 12, "emergente"
    if n < 50000:
        return 22, "mid bajo"
    if n < 500000:
        return 35, "sweet spot"
    if n < 2000000:
        return 32, "grande, operable"
    if n < 5000000:
        return 24, "muy grande"
    return 16, "mega, difícil de firmar"


def _eng_points(rate: float) -> tuple[int, str]:
    pct = rate * 100
    if pct <= 0:
        return 8, "sin dato de engagement"
    if pct < 0.5:
        return 5, f"{pct:.2f}% bajo"
    if pct < 1.5:
        return 12, f"{pct:.2f}% ok"
    if pct < 4:
        return 22, f"{pct:.2f}% fuerte"
    return 25, f"{pct:.2f}% excelente"


def _place_points(text: str, ciudad: str) -> tuple[int, str]:
    blob = f"{text} {ciudad}".lower()
    if any(w in blob for w in CO_WORDS):
        return 20, "Colombia"
    if any(w in blob for w in LATAM_WORDS):
        return 12, "LATAM"
    if ciudad.strip():
        return 6, ciudad.strip()
    return 6, "ubicación desconocida"


def grade(score: int) -> str:
    if score >= 80:
        return "A"
    if score >= 65:
        return "B"
    if score >= 50:
        return "C"
    return "D"


def score_lead(lead: dict) -> dict:
    if not _key():
        return {"ok": False, "error": "missing_scrapecreators_key"}
    raw_handle = str(lead.get("handle") or "")
    handles = parse_handles(raw_handle)
    profiles = []
    for platform, handle in handles:
        if platform == "instagram":
            profiles.append(_ig_profile(handle))
        elif platform == "tiktok":
            profiles.append(_tt_profile(handle))
        elif platform == "youtube":
            profiles.append(_yt_profile(handle))
    # If IG missed and we only tried IG, try TikTok with the same handle.
    if handles and all(p.get("platform") == "instagram" and not p.get("ok") for p in profiles):
        h = handles[0][1]
        profiles.append(_tt_profile(h))

    ok_profiles = [p for p in profiles if p.get("ok")]
    reasons = []
    if not ok_profiles:
        return {
            "ok": False,
            "grade": "D",
            "score": 0,
            "verdict": "no_fit",
            "reason": "no pudimos leer las cuentas",
            "profiles": profiles,
        }

    best = max(ok_profiles, key=lambda p: p.get("followers") or 0)
    if any(p.get("private") for p in ok_profiles) and best.get("private"):
        return {
            "ok": True,
            "grade": "D",
            "score": 8,
            "verdict": "no_fit",
            "reason": "cuenta privada",
            "followers": best.get("followers"),
            "profiles": ok_profiles,
        }

    aud_pts, aud_note = _audience_points(best.get("followers") or 0)
    reasons.append(aud_note)
    eng_pts, eng_note = _eng_points(best.get("engagement") or 0)
    reasons.append(eng_note)
    loc_blob = " ".join(
        str(p.get("bio") or "") + " " + str(p.get("location_text") or "") for p in ok_profiles
    )
    loc_pts, loc_note = _place_points(loc_blob, str(lead.get("ciudad") or ""))
    reasons.append(loc_note)

    ops = 10
    post = str(lead.get("post_show") or "").strip()
    if post and post.lower() not in {"no", "nada", "ninguno", "ninguna"}:
        ops += 6
        reasons.append("viene de show/viral")
    rep = str(lead.get("representado") or "").lower()
    if any(w in rep for w in ("sí", "si", "yes", "agencia", "manager")):
        ops -= 4
        reasons.append("ya representado")
    else:
        reasons.append("sin representación clara")
    ops = max(0, min(16, ops))

    total = aud_pts + eng_pts + loc_pts + ops
    g = grade(total)
    # Post-show bump for emerging accounts
    if "viene de show" in " ".join(reasons) and (best.get("followers") or 0) >= 10000 and g == "C":
        g = "B"
        reasons.append("bump post-show")

    verdict = {"A": "prioridad", "B": "fuerte", "C": "revisar", "D": "no_fit"}[g]
    return {
        "ok": True,
        "grade": g,
        "score": total,
        "verdict": verdict,
        "reason": "; ".join(reasons),
        "followers": best.get("followers"),
        "engagement": best.get("engagement"),
        "best_platform": best.get("platform"),
        "best_handle": best.get("handle"),
        "profiles": ok_profiles,
    }


def run_and_store(lead: dict, path: Path) -> dict:
    result = score_lead(lead)
    row = {
        "_kind": "score",
        "_ts": time.time(),
        "nombre": lead.get("nombre"),
        "whatsapp": lead.get("whatsapp"),
        "handle": lead.get("handle"),
        "ciudad": lead.get("ciudad"),
        **result,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(
        f"score {row.get('grade')} {row.get('score')} @{row.get('best_handle') or lead.get('handle')} {row.get('verdict')}"
    )
    return result
