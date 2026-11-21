"""
SNU Campus Exchange – single Lambda handler for HTTP API Gateway.
Region: ap-southeast-2 | Runtime: Python 3.12
Tables: Players, Checkins, Profiles, Memberships, Waves, Items, Ratings, Users, Portfolios
Auth: PBKDF2 password hashing, HMAC-SHA256 signed tokens (7-day expiry)
Routing: uses rawPath + requestContext.http.method (works with a single $default catch-all route)
"""
import boto3, json, time, uuid, hashlib, hmac, os, base64, math
from decimal import Decimal
from boto3.dynamodb.conditions import Key, Attr
from botocore.config import Config as BotoConfig

REGION = "ap-southeast-2"

ddb = boto3.resource("dynamodb", region_name=REGION)
checkins    = ddb.Table("Checkins")
profiles    = ddb.Table("Profiles")
memberships = ddb.Table("Memberships")
waves       = ddb.Table("Waves")
items       = ddb.Table("Items")
ratings     = ddb.Table("Ratings")
users       = ddb.Table("Users")
portfolios  = ddb.Table("Portfolios")

S3_BUCKET = os.environ.get("S3_BUCKET", "snu-campus-exchange-uploads")
s3 = boto3.client("s3", region_name=REGION, config=BotoConfig(signature_version="s3v4"))

AUTH_SECRET = os.environ.get("AUTH_SECRET", "dev-secret-change-me")
TOKEN_EXPIRY = 7 * 24 * 3600  # 7 days
IST_OFFSET_SECS = 19800  # UTC+5:30 (5 * 3600 + 30 * 60)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
}

# ---------- SHARED GAME CONFIG ----------
CATS = {
    "land":   {"c": "#8b8fa3", "b": 40,  "pk": [9, 16],        "n": "Landmark",    "t": "Everyone passes through. Steady and never wild."},
    "acad":   {"c": "#3a56e8", "b": 90,  "pk": [10.5, 15],     "n": "Academics",   "t": "Busy during lectures, quiet after 5 PM."},
    "lib":    {"c": "#1f2a6b", "b": 110, "pk": [19, 22.5],     "n": "Library",     "t": "Fills up in the evening, brutal before exams."},
    "ess":    {"c": "#f5c518", "b": 55,  "pk": [18, 23.5],     "n": "Essentials",  "t": "Evening rush, and midnight Maggi runs."},
    "food":   {"c": "#ff9f1c", "b": 35,  "pk": [13.5, 17, 21], "n": "Food",        "t": "Queue length is the demand signal."},
    "dine":   {"c": "#ff6b3d", "b": 45,  "pk": [8.5, 13.5, 20],"n": "Dining hall", "t": "Meal times only. Buy before the rush, sell in it."},
    "host":   {"c": "#ff5fb8", "b": 70,  "pk": [23],           "n": "Hostel",      "t": "Calm in the day, wild at night."},
    "health": {"c": "#e5484d", "b": 60,  "pk": [12, 17],       "n": "Healthcare",  "t": "Spikes in exam and fest weeks."},
    "sport":  {"c": "#19b36a", "b": 65,  "pk": [17.5, 19],     "n": "Sports",      "t": "Evening is game time."},
    "green":  {"c": "#2f8f5b", "b": 50,  "pk": [17.5],         "n": "Green place", "t": "Peaceful. Sunset is the peak."},
}

PLACES = [
    ["gate", "Gate 1", "land", 500, 585], ["vista", "Central Vista", "land", 500, 495], ["uac", "UAC", "land", 640, 470],
    ["a", "A Block", "acad", 390, 400], ["b", "B Block", "acad", 460, 380], ["c", "C Block", "acad", 540, 380], ["d", "D Block", "acad", 610, 400],
    ["lib", "Central Library", "lib", 500, 310],
    ["arc", "Shopping Arcade", "ess", 320, 480], ["mini", "24/7 Minimart", "ess", 235, 525],
    ["cnd", "CnD", "food", 370, 555], ["anb", "AnB", "food", 285, 430], ["grub", "Grub Square", "food", 190, 455], ["nes", "Nescafe", "food", 420, 305],
    ["dh1", "DH 1", "dine", 150, 240], ["dh2", "DH 2", "dine", 290, 240], ["dh3", "DH 3", "dine", 430, 230],
    ["h1", "Sunderbans 1A", "host", 110, 80], ["h2", "Kaziranga 2B", "host", 220, 80], ["h3", "Gir 3A", "host", 330, 80], ["h4", "Manas 4A", "host", 440, 80],
    ["h5", "Betla 5A", "host", 110, 150], ["h6", "Satpura 6B", "host", 220, 150], ["h7", "Eagle Nest", "host", 330, 150], ["h8", "Tower 9", "host", 440, 150],
    ["hwc", "Health and Wellness", "health", 780, 230], ["pharm", "Pharmacy", "health", 870, 300],
    ["amph", "Amphitheatre", "sport", 690, 240], ["golf", "Golf Course", "sport", 900, 160], ["bask", "Basketball Court", "sport", 760, 400],
    ["foot", "Football Ground", "sport", 850, 450], ["crick", "Cricket Ground", "sport", 880, 545], ["isc", "ISC", "sport", 750, 525], ["gym", "Gym", "sport", 650, 555],
    ["lake", "Lake SNU", "green", 610, 150], ["bio", "SNU Biodiversity Park", "green", 790, 95],
]

EVENTS = [
    ["Surprise quiz tomorrow. Everyone is heading to the library", {"lib": 0.22, "@acad": 0.08, "nes": 0.12}],
    ["Fest night at the Amphitheatre", {"amph": 0.30, "@food": 0.10, "@host": -0.05}],
    ["Football match tonight", {"foot": 0.25, "crick": 0.08, "bask": 0.10}],
    ["DH 2 is serving paneer today", {"dh2": 0.28, "dh1": -0.08, "dh3": -0.08}],
    ["Maggi shortage at the Minimart", {"mini": 0.25, "arc": 0.10}],
    ["Power cut in the hostel blocks", {"@host": -0.15, "lib": 0.12}],
    ["Placement talk at the UAC", {"uac": 0.25, "@acad": 0.06}],
    ["Mid-sem datesheet released", {"lib": 0.20, "@acad": 0.10, "gym": -0.10}],
    ["Free sunset yoga by the lake", {"lake": 0.25, "bio": 0.12}],
    ["Health camp at the wellness centre", {"hwc": 0.25, "pharm": 0.15}],
    ["Rain starts, everyone runs indoors", {"@sport": -0.15, "@green": -0.15, "@food": 0.08, "arc": 0.08}],
    ["Cold coffee offer at Nescafe", {"nes": 0.25, "cnd": -0.08}],
]

PLACES_DICT = {}
for _idx, _p in enumerate(PLACES):
    _pid, _name, _cat, _x, _y = _p
    _base = CATS[_cat]["b"] * (0.85 + ((_idx * 37) % 30) / 100.0)
    PLACES_DICT[_pid] = {
        "id": _pid, "name": _name, "cat": _cat, "base": _base, "x": _x, "y": _y, "index": _idx
    }

# ---------- TIME & PRICING HELPERS ----------
def get_ist_time(epoch_now=None):
    """Return (dayKey, hourIST) for an epoch timestamp using fixed UTC+5:30 offset."""
    if epoch_now is None:
        epoch_now = time.time()
    ist_sec = epoch_now + IST_OFFSET_SECS
    gm = time.gmtime(ist_sec)
    day_key = f"{gm.tm_year:04d}-{gm.tm_mon:02d}-{gm.tm_mday:02d}"
    hour_ist = gm.tm_hour + gm.tm_min / 60.0 + gm.tm_sec / 3600.0
    return day_key, hour_ist

def calc_demand(cat, hour_ist):
    """Calculate demand multiplier for a category based on circular distance to peak hours."""
    peaks = CATS[cat]["pk"]
    total = 0.0
    for p in peaks:
        diff = abs(hour_ist - p) % 24.0
        if diff > 12.0:
            diff = 24.0 - diff
        total += math.exp(-(diff ** 2) / (2.0 * 1.4 * 1.4))
    return min(1.2, total)

def get_noise(place_id, now_ts):
    """Generate deterministic noise in range [-0.03, +0.03] for a place and 5-min bucket."""
    bucket = int(now_ts // 300)
    h_str = f"{place_id}:{bucket}"
    h_val = int(hashlib.md5(h_str.encode()).hexdigest()[:8], 16)
    return -0.03 + (h_val / 4294967295.0) * 0.06

def get_event_info(now_ts):
    """Return current event text and effect parameters decaying linearly over the hour."""
    hour_idx = int(now_ts // 3600)
    h_val = int(hashlib.md5(str(hour_idx).encode()).hexdigest()[:8], 16)
    curr_event = EVENTS[h_val % len(EVENTS)]
    curr_text = curr_event[0]
    curr_fx = curr_event[1]
    progress = (now_ts % 3600) / 3600.0  # 0.0 at hour start -> 1.0 at hour end
    return curr_text, curr_fx, progress

def calc_price(place_id, now_ts, crowd_count=0):
    """Calculate the deterministic server-authoritative price for a place at timestamp now_ts."""
    p = PLACES_DICT[place_id]
    cat = p["cat"]
    base = p["base"]
    _, hour_ist = get_ist_time(now_ts)
    dem = calc_demand(cat, hour_ist)
    noise = get_noise(place_id, now_ts)
    _, curr_fx, progress = get_event_info(now_ts)

    event_raw = curr_fx.get(place_id, curr_fx.get(f"@{cat}", 0.0))
    event_effect = event_raw * (1.0 - progress)

    price_val = base * (0.6 + dem) * (1.0 + 0.05 * crowd_count) * (1.0 + noise) * (1.0 + event_effect)
    price_val = max(1.0, price_val)
    return round(price_val, 2)

def get_crowd_counts(now_ts):
    """Return map of placeId to real check-in count in the last 1800 seconds."""
    cutoff = now_ts - 1800
    its = checkins.scan(
        FilterExpression=Attr("timestamp").gte(cutoff) & Attr("real").eq(True)
    ).get("Items", [])
    counts = {}
    for i in its:
        pid = i["placeId"]
        counts[pid] = counts.get(pid, 0) + 1
    return counts

def get_place_crowd30(place_id, now_ts):
    """Return real check-in count for a specific place in the last 1800 seconds."""
    cutoff = now_ts - 1800
    its = checkins.query(
        KeyConditionExpression=Key("placeId").eq(place_id) & Key("timestamp").gte(cutoff),
        FilterExpression=Attr("real").eq(True)
    ).get("Items", [])
    return len(its)

def get_or_create_portfolio(email, uname=None, now_ts=None):
    """Fetch user portfolio from Portfolios table; never resets so cash and holdings persist permanently."""
    if now_ts is None:
        now_ts = int(time.time())
    item = portfolios.get_item(Key={"username": email}).get("Item")
    if not item:
        display_name = uname or email.split("@")[0]
        item = {
            "username": email,
            "displayName": display_name,
            "cash": Decimal("10000"),
            "holdings": {},
            "visitedPlaces": [],
            "version": 0,
            "createdAt": now_ts,
            "updatedAt": now_ts
        }
        portfolios.put_item(Item=item)
    elif uname and item.get("displayName") != uname:
        item["displayName"] = uname
    return item

# ---------- AUTH HELPERS ----------
def hash_password(password, salt=None):
    """Hash password using PBKDF2 HMAC-SHA256 with 100k rounds and random salt."""
    if salt is None:
        salt = os.urandom(16)
    else:
        salt = base64.b64decode(salt)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return base64.b64encode(salt).decode(), base64.b64encode(dk).decode()

def verify_password(password, stored_salt, stored_hash):
    """Verify password hash with constant-time comparison."""
    _, computed = hash_password(password, stored_salt)
    return hmac.compare_digest(computed, stored_hash)

def make_token(email, name):
    """Create HMAC-SHA256 signed bearer token with 7-day expiration."""
    exp = int(time.time()) + TOKEN_EXPIRY
    payload = f"{email}|{name}|{exp}"
    sig = hmac.new(AUTH_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    token = base64.b64encode(f"{payload}|{sig}".encode()).decode()
    return token

def verify_token(token):
    """Verify signed bearer token and return (email, name) or None."""
    try:
        decoded = base64.b64decode(token).decode()
        parts = decoded.rsplit("|", 1)
        if len(parts) != 2:
            return None
        payload, sig = parts
        expected = hmac.new(AUTH_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        segs = payload.split("|")
        if len(segs) != 3:
            return None
        email, name, exp = segs
        if int(exp) < int(time.time()):
            return None
        return email, name
    except Exception:
        return None

def get_user(event):
    """Extract and verify email and name from Authorization header."""
    auth = (event.get("headers") or {}).get("authorization", "")
    if not auth.startswith("Bearer "):
        return None
    return verify_token(auth[7:])

class DecEncoder(json.JSONEncoder):
    """Custom JSON encoder converting Decimal instances to int or float."""
    def default(self, o):
        if isinstance(o, Decimal):
            return int(o) if o == int(o) else float(o)
        return super().default(o)

def resp(code, body):
    """Helper to return an API Gateway response with standard CORS headers."""
    return {"statusCode": code, "headers": CORS_HEADERS, "body": json.dumps(body, cls=DecEncoder)}

# Routes that do NOT require auth
PUBLIC_PATHS = {
    ("POST", "/signup"),
    ("POST", "/login"),
    ("GET", "/leaderboard"),
    ("GET", "/crowd"),
}

def handler(event, context):
    try:
        # --- Derive method + path from the event ---
        http_ctx = (event.get("requestContext") or {}).get("http") or {}
        method = http_ctx.get("method", event.get("httpMethod", "GET")).upper()
        path   = event.get("rawPath", event.get("path", "/"))

        # --- Handle OPTIONS (CORS preflight) ---
        if method == "OPTIONS":
            return resp(200, {"ok": True})

        raw_body = event.get("body")
        if isinstance(raw_body, dict):
            body = raw_body
        elif isinstance(raw_body, str) and raw_body:
            try:
                body = json.loads(raw_body)
            except Exception:
                body = {}
        else:
            body = {}

        qs   = event.get("queryStringParameters") or {}
        now  = int(time.time())

        # --- Auth middleware ---
        email = None
        uname = None
        if (method, path) not in PUBLIC_PATHS:
            user_info = get_user(event)
            if not user_info:
                return resp(401, {"error": "Not authenticated. Please log in."})
            email, uname = user_info

        # ========== SIGNUP ==========
        if method == "POST" and path == "/signup":
            em = (body.get("email") or "").strip().lower()
            nm = (body.get("name") or "").strip()
            pw = body.get("password", "")
            if not em.endswith("@snu.edu.in"):
                return resp(400, {"error": "Use your @snu.edu.in email."})
            if len(pw) < 6:
                return resp(400, {"error": "Password must be at least 6 characters."})
            if len(nm) < 2:
                return resp(400, {"error": "Name must be at least 2 characters."})
            existing = users.get_item(Key={"email": em}).get("Item")
            if existing:
                return resp(409, {"error": "Account already exists."})
            salt, pw_hash = hash_password(pw)
            users.put_item(Item={
                "email": em, "name": nm, "salt": salt, "pwHash": pw_hash, "createdAt": now,
            })
            token = make_token(em, nm)
            return resp(200, {"token": token, "email": em, "name": nm})

        # ========== LOGIN ==========
        if method == "POST" and path == "/login":
            em = (body.get("email") or "").strip().lower()
            pw = body.get("password", "")
            if not em.endswith("@snu.edu.in"):
                return resp(400, {"error": "Use your @snu.edu.in email."})
            u = users.get_item(Key={"email": em}).get("Item")
            if not u:
                return resp(401, {"error": "Wrong email or password."})
            if not verify_password(pw, u["salt"], u["pwHash"]):
                return resp(401, {"error": "Wrong email or password."})
            nm = u.get("name", em.split("@")[0])
            token = make_token(em, nm)
            return resp(200, {"token": token, "email": em, "name": nm})

        # ---------- GET PRICES (Auth required) ----------
        if method == "GET" and path == "/prices":
            crowd_map = get_crowd_counts(now)
            prices_data = {}
            for pid in PLACES_DICT:
                cur_p = calc_price(pid, now, crowd_map.get(pid, 0))
                prev_p = calc_price(pid, now - 3600, crowd_map.get(pid, 0))
                prices_data[pid] = {"price": cur_p, "prevHourPrice": prev_p}

            curr_text, _, _ = get_event_info(now)
            day_key, hour_ist = get_ist_time(now)
            return resp(200, {
                "prices": prices_data,
                "news": curr_text,
                "dayKey": day_key,
                "hourIST": round(hour_ist, 2)
            })

        # ---------- GET PORTFOLIO (Auth required) ----------
        if method == "GET" and path == "/portfolio":
            pf = get_or_create_portfolio(email, uname, now)
            cash = float(pf.get("cash", 10000))
            holdings = pf.get("holdings", {})
            net_worth = cash
            for pid, h in holdings.items():
                q = int(h.get("q", 0))
                if q > 0 and pid in PLACES_DICT:
                    net_worth += q * calc_price(pid, now, 0)

            return resp(200, {
                "cash": cash,
                "holdings": holdings,
                "visitedPlaces": pf.get("visitedPlaces", []),
                "netWorth": round(net_worth, 2)
            })

        # ---------- POST TRADE (Auth required) ----------
        if method == "POST" and path == "/trade":
            place_id = body.get("placeId")
            side = body.get("side")
            qty_raw = body.get("qty")

            if place_id not in PLACES_DICT:
                return resp(400, {"error": "Invalid placeId."})
            if side not in ("buy", "sell"):
                return resp(400, {"error": "Invalid side. Must be 'buy' or 'sell'."})
            try:
                qty = int(qty_raw)
                if qty < 1 or qty > 100:
                    raise ValueError()
            except (ValueError, TypeError):
                return resp(400, {"error": "Quantity must be an integer between 1 and 100."})

            crowd = get_place_crowd30(place_id, now)
            current_price = calc_price(place_id, now, crowd)
            total_amt = round(current_price * qty, 2)

            pf = get_or_create_portfolio(email, uname, now)
            cash = float(pf.get("cash", 10000))
            holdings = dict(pf.get("holdings", {}))
            old_version = int(pf.get("version", 0))

            if side == "buy":
                if cash < total_amt:
                    return resp(400, {"error": "Not enough cash."})
                cur_h = dict(holdings.get(place_id, {"q": 0, "avg": 0}))
                old_q = int(cur_h.get("q", 0))
                old_avg = float(cur_h.get("avg", 0))
                new_q = old_q + qty
                new_avg = round((old_avg * old_q + total_amt) / new_q, 2)
                new_cash = round(cash - total_amt, 2)
                holdings[place_id] = {"q": Decimal(str(new_q)), "avg": Decimal(str(new_avg))}
            else:  # sell
                cur_h = holdings.get(place_id)
                old_q = int(cur_h.get("q", 0)) if cur_h else 0
                if old_q < qty:
                    return resp(400, {"error": "Not enough shares to sell."})
                new_q = old_q - qty
                new_cash = round(cash + total_amt, 2)
                if new_q == 0:
                    holdings.pop(place_id, None)
                else:
                    holdings[place_id] = {"q": Decimal(str(new_q)), "avg": Decimal(str(cur_h.get("avg", 0)))}

            new_version = old_version + 1
            updated_item = {
                "username": email,
                "displayName": pf.get("displayName", email.split("@")[0]),
                "cash": Decimal(str(new_cash)),
                "holdings": holdings,
                "visitedPlaces": pf.get("visitedPlaces", []),
                "version": new_version,
                "updatedAt": now
            }

            try:
                portfolios.put_item(
                    Item=updated_item,
                    ConditionExpression=Attr("version").eq(old_version)
                )
            except ddb.meta.client.exceptions.ConditionalCheckFailedException:
                return resp(409, {"error": "Trade conflict. Please retry."})

            # Calculate net worth
            net_worth = new_cash
            for pid, h in holdings.items():
                q = int(h.get("q", 0))
                if q > 0 and pid in PLACES_DICT:
                    net_worth += q * calc_price(pid, now, 0)

            return resp(200, {
                "portfolio": {
                    "cash": new_cash,
                    "holdings": holdings,
                    "visitedPlaces": updated_item["visitedPlaces"],
                    "netWorth": round(net_worth, 2)
                },
                "executedPrice": current_price
            })

        # ---------- CHECKIN (Auth required) ----------
        if method == "POST" and path == "/checkin":
            real = body.get("real", False)
            if not real:
                return resp(200, {"success": True, "bonus": 0})

            place_id = body.get("placeId")
            if not place_id or place_id not in PLACES_DICT:
                return resp(400, {"error": "Invalid placeId."})

            # Check server-side cooldown: 600s
            cooldown_cutoff = now - 600
            recent = checkins.query(
                KeyConditionExpression=Key("placeId").eq(place_id) & Key("timestamp").gte(cooldown_cutoff)
            ).get("Items", [])
            for item in recent:
                if item.get("username") == email and item.get("real") is True:
                    return resp(429, {"error": "Wait 10 minutes."})

            # Store 2 items (double count for real check-in)
            for _ in range(2):
                checkins.put_item(Item={
                    "placeId":   place_id,
                    "timestamp": now + _,
                    "username":  email,
                    "ttl":       now + 7200,
                    "real":      True,
                })

            # Track visited places in portfolio permanently & award 100 bonus on first visit
            pf = get_or_create_portfolio(email, uname, now)
            visited = list(pf.get("visitedPlaces", []))
            bonus = 0
            if place_id not in visited:
                bonus = 100
                visited.append(place_id)
                old_version = int(pf.get("version", 0))
                new_version = old_version + 1
                new_cash = Decimal(str(round(float(pf.get("cash", 10000)) + 100, 2)))
                try:
                    portfolios.put_item(
                        Item={
                            "username": email,
                            "displayName": pf.get("displayName", email.split("@")[0]),
                            "cash": new_cash,
                            "holdings": pf.get("holdings", {}),
                            "visitedPlaces": visited,
                            "version": new_version,
                            "updatedAt": now
                        },
                        ConditionExpression=Attr("version").eq(old_version)
                    )
                except Exception:
                    pass

            return resp(200, {"success": True, "bonus": bonus})

        # ---------- CROWD (Public) ----------
        if method == "GET" and path == "/crowd":
            cutoff = now - 1800
            its = checkins.scan(
                FilterExpression=Attr("timestamp").gte(cutoff) & Attr("real").eq(True)
            ).get("Items", [])
            counts = {}
            for i in its:
                pid = i["placeId"]
                counts[pid] = counts.get(pid, 0) + 1
            return resp(200, counts)

        # ---------- HERE (Auth required) ----------
        if method == "GET" and path == "/here":
            place = qs.get("placeId", "")
            cutoff = now - 1800
            its = checkins.query(
                KeyConditionExpression=Key("placeId").eq(place) & Key("timestamp").gte(cutoff),
                FilterExpression=Attr("real").eq(True)
            ).get("Items", [])
            user_list = list({i["username"] for i in its})
            return resp(200, {"users": user_list})

        # ---------- LEADERBOARD (Public) ----------
        if method == "GET" and path == "/leaderboard":
            p_items = portfolios.scan().get("Items", [])
            lb = []
            for it in p_items:
                cash = float(it.get("cash", 10000))
                nw = cash
                for pid, h in it.get("holdings", {}).items():
                    q = int(h.get("q", 0))
                    if q > 0 and pid in PLACES_DICT:
                        nw += q * calc_price(pid, now, 0)
                disp = it.get("displayName") or it.get("username", "").split("@")[0]
                lb.append({"username": disp, "bestScore": round(nw, 2)})
            lb.sort(key=lambda x: x["bestScore"], reverse=True)
            return resp(200, lb[:10])

        # ---------- PROFILE (Auth required) ----------
        if method == "POST" and path == "/profile":
            profiles.put_item(Item={
                "username":    email,
                "displayName": uname,
                "department":  body.get("department", ""),
                "batch":       body.get("batch", ""),
                "interests":   body.get("interests", []),
                "avatarColor": body.get("avatarColor", "#D62FA8"),
            })
            return resp(200, {"success": True})

        # ---------- STUDENTS (Auth required) ----------
        if method == "GET" and path == "/students":
            fe_parts, eav = [], {}
            if qs.get("department"):
                fe_parts.append("department = :dept")
                eav[":dept"] = qs["department"]
            if qs.get("batch"):
                fe_parts.append("batch = :bat")
                eav[":bat"] = qs["batch"]
            if qs.get("interest"):
                fe_parts.append("contains(interests, :intr)")
                eav[":intr"] = qs["interest"]
            kwargs = {}
            if fe_parts:
                kwargs["FilterExpression"] = " AND ".join(fe_parts)
                kwargs["ExpressionAttributeValues"] = eav
            its = profiles.scan(**kwargs).get("Items", [])
            return resp(200, its)

        # ---------- STUDENT DETAIL (Auth required) ----------
        if method == "GET" and path == "/student-detail":
            target_user = qs.get("user", "")
            if not target_user:
                return resp(400, {"error": "Missing user param."})
            prof = profiles.get_item(Key={"username": target_user}).get("Item")
            if not prof:
                profs = profiles.scan(FilterExpression=Attr("username").eq(target_user)).get("Items", [])
                prof = profs[0] if profs else {}

            pf = portfolios.get_item(Key={"username": target_user}).get("Item") or {}
            cash = float(pf.get("cash", 10000))
            holdings = pf.get("holdings", {})
            visited = pf.get("visitedPlaces", [])

            # Compute live net worth
            net_worth = cash
            for pid, h in holdings.items():
                q = int(h.get("q", 0))
                if q > 0 and pid in PLACES_DICT:
                    net_worth += q * calc_price(pid, now, 0)

            # Find latest checkin for this user
            recent_checkins = checkins.scan(
                FilterExpression=Attr("username").eq(target_user) & Attr("real").eq(True)
            ).get("Items", [])
            recent_checkins.sort(key=lambda x: x.get("timestamp", 0), reverse=True)
            latest_checkin = None
            if recent_checkins:
                pid = recent_checkins[0].get("placeId")
                latest_checkin = {
                    "placeId": pid,
                    "placeName": PLACES_DICT.get(pid, {}).get("name", pid),
                    "timestamp": recent_checkins[0].get("timestamp")
                }

            return resp(200, {
                "username": target_user,
                "displayName": prof.get("displayName") or pf.get("displayName") or target_user.split("@")[0],
                "department": prof.get("department", ""),
                "batch": prof.get("batch", ""),
                "interests": prof.get("interests", []),
                "avatarColor": prof.get("avatarColor", "#D62FA8"),
                "cash": round(cash, 2),
                "netWorth": round(net_worth, 2),
                "holdings": holdings,
                "visitedPlaces": visited,
                "latestCheckin": latest_checkin
            })

        # ---------- JOIN (Auth required) ----------
        if method == "POST" and path == "/join":
            memberships.put_item(Item={
                "community": body["community"],
                "username":  email,
            })
            return resp(200, {"success": True})

        # ---------- LEAVE (Auth required) ----------
        if method == "POST" and path == "/leave":
            memberships.delete_item(Key={
                "community": body["community"],
                "username":  email,
            })
            return resp(200, {"success": True})

        # ---------- COMMUNITIES (Auth required) ----------
        if method == "GET" and path == "/communities":
            its = memberships.scan().get("Items", [])
            counts = {}
            for i in its:
                c = i["community"]
                counts[c] = counts.get(c, 0) + 1
            return resp(200, counts)

        # ---------- WAVE (Auth required) ----------
        if method == "POST" and path == "/wave":
            waves.put_item(Item={
                "toUser":    body["toUser"],
                "timestamp": now,
                "fromUser":  email,
            })
            return resp(200, {"success": True})

        # ---------- WAVES (Auth required) ----------
        if method == "GET" and path == "/waves":
            its = waves.query(
                KeyConditionExpression=Key("toUser").eq(email),
                ScanIndexForward=False,
                Limit=20,
            ).get("Items", [])
            out = [{"fromUser": i["fromUser"], "timestamp": i["timestamp"]} for i in its]
            return resp(200, out)

        # ---------- UPLOAD URL (S3 presigned, Auth required) ----------
        if method == "POST" and path == "/upload-url":
            key = "items/" + str(uuid.uuid4()) + ".jpg"
            url = s3.generate_presigned_url(
                "put_object",
                Params={"Bucket": S3_BUCKET, "Key": key, "ContentType": "image/jpeg"},
                ExpiresIn=300,
            )
            return resp(200, {"uploadUrl": url, "key": key})

        # ---------- POST ITEM (Lost & Found, Auth required) ----------
        if method == "POST" and path == "/items":
            item_id = str(uuid.uuid4())[:8]
            item = {
                "itemId":      item_id,
                "type":        body.get("type", "lost"),
                "title":       body.get("title", ""),
                "description": body.get("description", ""),
                "placeId":     body.get("placeId", ""),
                "reportedBy":  email,
                "reporterName": uname,
                "contact":     body.get("contact", email),
                "status":      "open",
                "createdAt":   now,
            }
            if body.get("imageKey"):
                item["imageKey"] = body["imageKey"]
            items.put_item(Item=item)
            return resp(200, {"success": True, "itemId": item_id})

        # ---------- GET ITEMS (Auth required) ----------
        if method == "GET" and path == "/items":
            fe_parts, eav = [], {}
            if qs.get("placeId"):
                fe_parts.append("placeId = :pid")
                eav[":pid"] = qs["placeId"]
            if qs.get("status"):
                fe_parts.append("#st = :st")
                eav[":st"] = qs["status"]
            if qs.get("type"):
                fe_parts.append("#tp = :tp")
                eav[":tp"] = qs["type"]
            if qs.get("mine") and email:
                fe_parts.append("reportedBy = :me")
                eav[":me"] = email
            kwargs = {}
            ean = {}
            if any(k in [s for s in qs] for k in ["status"]):
                ean["#st"] = "status"
            if "type" in qs:
                ean["#tp"] = "type"
            if fe_parts:
                kwargs["FilterExpression"] = " AND ".join(fe_parts)
                kwargs["ExpressionAttributeValues"] = eav
            if ean:
                kwargs["ExpressionAttributeNames"] = ean
            its = items.scan(**kwargs).get("Items", [])
            its.sort(key=lambda x: x.get("createdAt", 0), reverse=True)
            return resp(200, its[:50])

        # ---------- RESOLVE ITEM (Auth required) ----------
        if method == "POST" and path == "/items/resolve":
            item_id = body.get("itemId", "")
            its = items.scan(FilterExpression=Attr("itemId").eq(item_id)).get("Items", [])
            if its:
                it = its[0]
                if it.get("reportedBy") != email:
                    return resp(403, {"error": "Only the reporter can resolve this item."})
                items.update_item(
                    Key={"itemId": item_id},
                    UpdateExpression="SET #st = :s",
                    ExpressionAttributeNames={"#st": "status"},
                    ExpressionAttributeValues={":s": "returned"},
                )
            return resp(200, {"success": True})

        # ---------- DELETE ITEM (Auth required) ----------
        if method == "POST" and path == "/items/delete":
            item_id = body.get("itemId", "")
            its = items.scan(FilterExpression=Attr("itemId").eq(item_id)).get("Items", [])
            if its:
                it = its[0]
                if it.get("reportedBy") != email:
                    return resp(403, {"error": "Only the reporter can delete this item."})
                items.delete_item(Key={"itemId": item_id})
            return resp(200, {"success": True})

        # ---------- POST RATING (Auth required) ----------
        if method == "POST" and path == "/rating":
            ratings.put_item(Item={
                "placeId":   body["placeId"],
                "timestamp": now,
                "stars":     Decimal(str(body.get("stars", 3))),
                "tag":       body.get("tag", ""),
                "username":  email,
            })
            return resp(200, {"success": True})

        # ---------- GET RATINGS (Auth required) ----------
        if method == "GET" and path == "/ratings":
            pid = qs.get("placeId", "")
            its = ratings.query(
                KeyConditionExpression=Key("placeId").eq(pid),
                ScanIndexForward=False,
                Limit=50,
            ).get("Items", [])
            if not its:
                return resp(200, {"avg": 0, "count": 0, "topTag": ""})
            avg = sum(float(i.get("stars", 0)) for i in its) / len(its)
            tags = {}
            for i in its:
                t = i.get("tag", "")
                if t:
                    tags[t] = tags.get(t, 0) + 1
            top_tag = max(tags, key=tags.get) if tags else ""
            return resp(200, {"avg": round(avg, 1), "count": len(its), "topTag": top_tag})

        return resp(404, {"error": f"Unknown route: {method} {path}"})

    except Exception as e:
        return resp(500, {"error": str(e)})
