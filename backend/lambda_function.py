"""
SNU Campus Exchange – single Lambda handler for HTTP API Gateway.
Region: ap-southeast-2 | Runtime: Python 3.12
Tables: Players, Checkins, Profiles, Memberships, Waves, Items, Ratings, Users
Auth: PBKDF2 password hashing, HMAC-SHA256 signed tokens (7-day expiry)
"""
import boto3, json, time, uuid, hashlib, hmac, os, base64
from decimal import Decimal
from boto3.dynamodb.conditions import Key, Attr
from botocore.config import Config as BotoConfig

ddb = boto3.resource("dynamodb", region_name="ap-southeast-2")
players     = ddb.Table("Players")
checkins    = ddb.Table("Checkins")
profiles    = ddb.Table("Profiles")
memberships = ddb.Table("Memberships")
waves       = ddb.Table("Waves")
items       = ddb.Table("Items")
ratings     = ddb.Table("Ratings")
users       = ddb.Table("Users")

S3_BUCKET = os.environ.get("S3_BUCKET", "snu-campus-exchange-uploads")
s3 = boto3.client("s3", region_name="ap-southeast-2", config=BotoConfig(signature_version="s3v4"))

AUTH_SECRET = os.environ.get("AUTH_SECRET", "dev-secret-change-me")
TOKEN_EXPIRY = 7 * 24 * 3600  # 7 days

HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "*",
    "Content-Type": "application/json",
}

# ---------- AUTH HELPERS ----------
def hash_password(password, salt=None):
    if salt is None:
        salt = os.urandom(16)
    else:
        salt = base64.b64decode(salt)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return base64.b64encode(salt).decode(), base64.b64encode(dk).decode()

def verify_password(password, stored_salt, stored_hash):
    _, computed = hash_password(password, stored_salt)
    return hmac.compare_digest(computed, stored_hash)

def make_token(email, name):
    exp = int(time.time()) + TOKEN_EXPIRY
    payload = f"{email}|{name}|{exp}"
    sig = hmac.new(AUTH_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    token = base64.b64encode(f"{payload}|{sig}".encode()).decode()
    return token

def verify_token(token):
    """Returns (email, name) or None."""
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
    """Extract email from Authorization: Bearer <token>. Returns (email, name) or None."""
    auth = (event.get("headers") or {}).get("authorization", "")
    if not auth.startswith("Bearer "):
        return None
    return verify_token(auth[7:])

class DecEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return int(o) if o == int(o) else float(o)
        return super().default(o)

def resp(code, body):
    return {"statusCode": code, "headers": HEADERS, "body": json.dumps(body, cls=DecEncoder)}

# Routes that do NOT require auth
PUBLIC_ROUTES = {"POST /signup", "POST /login", "GET /leaderboard", "GET /crowd"}

def handler(event, context):
    try:
        route = event.get("routeKey", "")
        body  = json.loads(event.get("body") or "{}")
        qs    = event.get("queryStringParameters") or {}
        now   = int(time.time())

        # --- Auth middleware ---
        email = None
        uname = None
        if route not in PUBLIC_ROUTES:
            user_info = get_user(event)
            if not user_info:
                return resp(401, {"error": "Not authenticated. Please log in."})
            email, uname = user_info

        # ========== SIGNUP ==========
        if route == "POST /signup":
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
        if route == "POST /login":
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

        # ---------- LEADERBOARD ----------
        if route == "GET /leaderboard":
            its = players.scan().get("Items", [])
            its.sort(key=lambda x: x.get("bestScore", 0), reverse=True)
            top = [{"username": i["username"], "bestScore": i["bestScore"]} for i in its[:10]]
            return resp(200, top)

        # ---------- SCORE ----------
        if route == "POST /score":
            score = Decimal(str(body["score"]))
            cur = players.get_item(Key={"username": email}).get("Item")
            if not cur or score > cur.get("bestScore", Decimal("0")):
                players.put_item(Item={"username": email, "bestScore": score, "displayName": uname})
                return resp(200, {"updated": True, "bestScore": score})
            return resp(200, {"updated": False, "bestScore": cur["bestScore"]})

        # ---------- CHECKIN ----------
        if route == "POST /checkin":
            real = body.get("real", False)
            count = 2 if real else 1
            for _ in range(count):
                checkins.put_item(Item={
                    "placeId":   body["placeId"],
                    "timestamp": now + _,
                    "username":  email,
                    "ttl":       now + 7200,
                    "real":      real,
                })
            return resp(200, {"success": True})

        # ---------- CROWD ----------
        if route == "GET /crowd":
            cutoff = now - 1800
            its = checkins.scan(FilterExpression=Attr("timestamp").gte(cutoff)).get("Items", [])
            counts = {}
            for i in its:
                pid = i["placeId"]
                counts[pid] = counts.get(pid, 0) + 1
            return resp(200, counts)

        # ---------- HERE ----------
        if route == "GET /here":
            place = qs.get("placeId", "")
            cutoff = now - 1800
            its = checkins.query(
                KeyConditionExpression=Key("placeId").eq(place) & Key("timestamp").gte(cutoff)
            ).get("Items", [])
            user_list = list({i["username"] for i in its})
            return resp(200, {"users": user_list})

        # ---------- PROFILE ----------
        if route == "POST /profile":
            profiles.put_item(Item={
                "username":    email,
                "displayName": uname,
                "department":  body.get("department", ""),
                "batch":       body.get("batch", ""),
                "interests":   body.get("interests", []),
                "avatarColor": body.get("avatarColor", "#D62FA8"),
            })
            return resp(200, {"success": True})

        # ---------- STUDENTS ----------
        if route == "GET /students":
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

        # ---------- JOIN ----------
        if route == "POST /join":
            memberships.put_item(Item={
                "community": body["community"],
                "username":  email,
            })
            return resp(200, {"success": True})

        # ---------- LEAVE ----------
        if route == "POST /leave":
            memberships.delete_item(Key={
                "community": body["community"],
                "username":  email,
            })
            return resp(200, {"success": True})

        # ---------- COMMUNITIES ----------
        if route == "GET /communities":
            its = memberships.scan().get("Items", [])
            counts = {}
            for i in its:
                c = i["community"]
                counts[c] = counts.get(c, 0) + 1
            return resp(200, counts)

        # ---------- WAVE ----------
        if route == "POST /wave":
            waves.put_item(Item={
                "toUser":    body["toUser"],
                "timestamp": now,
                "fromUser":  email,
            })
            return resp(200, {"success": True})

        # ---------- WAVES ----------
        if route == "GET /waves":
            its = waves.query(
                KeyConditionExpression=Key("toUser").eq(email),
                ScanIndexForward=False,
                Limit=20,
            ).get("Items", [])
            out = [{"fromUser": i["fromUser"], "timestamp": i["timestamp"]} for i in its]
            return resp(200, out)

        # ---------- UPLOAD URL (S3 presigned) ----------
        if route == "POST /upload-url":
            key = "items/" + str(uuid.uuid4()) + ".jpg"
            url = s3.generate_presigned_url(
                "put_object",
                Params={"Bucket": S3_BUCKET, "Key": key, "ContentType": "image/jpeg"},
                ExpiresIn=300,
            )
            return resp(200, {"uploadUrl": url, "key": key})

        # ---------- POST ITEM (Lost & Found) ----------
        if route == "POST /items":
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

        # ---------- GET ITEMS ----------
        if route == "GET /items":
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

        # ---------- RESOLVE ITEM ----------
        if route == "POST /items/resolve":
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

        # ---------- DELETE ITEM ----------
        if route == "POST /items/delete":
            item_id = body.get("itemId", "")
            its = items.scan(FilterExpression=Attr("itemId").eq(item_id)).get("Items", [])
            if its:
                it = its[0]
                if it.get("reportedBy") != email:
                    return resp(403, {"error": "Only the reporter can delete this item."})
                items.delete_item(Key={"itemId": item_id})
            return resp(200, {"success": True})

        # ---------- POST RATING ----------
        if route == "POST /rating":
            ratings.put_item(Item={
                "placeId":   body["placeId"],
                "timestamp": now,
                "stars":     Decimal(str(body.get("stars", 3))),
                "tag":       body.get("tag", ""),
                "username":  email,
            })
            return resp(200, {"success": True})

        # ---------- GET RATINGS ----------
        if route == "GET /ratings":
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

        return resp(404, {"error": "Unknown route: " + route})

    except Exception as e:
        return resp(500, {"error": str(e)})
