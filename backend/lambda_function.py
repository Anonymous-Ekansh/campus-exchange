"""
SNU Campus Exchange – single Lambda handler for HTTP API Gateway.
Region: ap-south-1 | Runtime: Python 3.12
Tables: Players, Checkins, Profiles, Memberships, Waves, Items, Ratings
"""
import boto3, json, time, uuid
from decimal import Decimal
from boto3.dynamodb.conditions import Key, Attr

ddb = boto3.resource("dynamodb", region_name="ap-south-1")
players     = ddb.Table("Players")
checkins    = ddb.Table("Checkins")
profiles    = ddb.Table("Profiles")
memberships = ddb.Table("Memberships")
waves       = ddb.Table("Waves")
items       = ddb.Table("Items")
ratings     = ddb.Table("Ratings")

HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "*",
    "Content-Type": "application/json",
}

class DecEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return int(o) if o == int(o) else float(o)
        return super().default(o)

def resp(code, body):
    return {"statusCode": code, "headers": HEADERS, "body": json.dumps(body, cls=DecEncoder)}

def handler(event, context):
    try:
        route = event.get("routeKey", "")
        body  = json.loads(event.get("body") or "{}")
        qs    = event.get("queryStringParameters") or {}
        now   = int(time.time())

        # ---------- LEADERBOARD ----------
        if route == "GET /leaderboard":
            its = players.scan().get("Items", [])
            its.sort(key=lambda x: x.get("bestScore", 0), reverse=True)
            top = [{"username": i["username"], "bestScore": i["bestScore"]} for i in its[:10]]
            return resp(200, top)

        # ---------- SCORE ----------
        if route == "POST /score":
            username = body["username"]
            score    = Decimal(str(body["score"]))
            cur = players.get_item(Key={"username": username}).get("Item")
            if not cur or score > cur.get("bestScore", Decimal("0")):
                players.put_item(Item={"username": username, "bestScore": score})
                return resp(200, {"updated": True, "bestScore": score})
            return resp(200, {"updated": False, "bestScore": cur["bestScore"]})

        # ---------- CHECKIN ----------
        if route == "POST /checkin":
            real = body.get("real", False)
            # Real check-ins count double in crowd
            count = 2 if real else 1
            for _ in range(count):
                checkins.put_item(Item={
                    "placeId":   body["placeId"],
                    "timestamp": now + _ ,  # offset by 1s to avoid overwrite
                    "username":  body["username"],
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
            users = list({i["username"] for i in its})
            return resp(200, {"users": users})

        # ---------- PROFILE ----------
        if route == "POST /profile":
            profiles.put_item(Item={
                "username":    body["username"],
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
                "username":  body["username"],
            })
            return resp(200, {"success": True})

        # ---------- LEAVE ----------
        if route == "POST /leave":
            memberships.delete_item(Key={
                "community": body["community"],
                "username":  body["username"],
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
                "fromUser":  body["fromUser"],
            })
            return resp(200, {"success": True})

        # ---------- WAVES ----------
        if route == "GET /waves":
            user = qs.get("user", "")
            its = waves.query(
                KeyConditionExpression=Key("toUser").eq(user),
                ScanIndexForward=False,
                Limit=20,
            ).get("Items", [])
            out = [{"fromUser": i["fromUser"], "timestamp": i["timestamp"]} for i in its]
            return resp(200, out)

        # ---------- POST ITEM (Lost & Found) ----------
        if route == "POST /items":
            item_id = str(uuid.uuid4())[:8]
            items.put_item(Item={
                "itemId":      item_id,
                "type":        body.get("type", "lost"),
                "title":       body.get("title", ""),
                "description": body.get("description", ""),
                "placeId":     body.get("placeId", ""),
                "reportedBy":  body.get("reportedBy", ""),
                "contact":     body.get("contact", ""),
                "status":      "open",
                "createdAt":   now,
            })
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
            # Find the item and update its status
            its = items.scan(FilterExpression=Attr("itemId").eq(item_id)).get("Items", [])
            if its:
                it = its[0]
                items.update_item(
                    Key={"itemId": item_id},
                    UpdateExpression="SET #st = :s",
                    ExpressionAttributeNames={"#st": "status"},
                    ExpressionAttributeValues={":s": "returned"},
                )
            return resp(200, {"success": True})

        # ---------- POST RATING ----------
        if route == "POST /rating":
            ratings.put_item(Item={
                "placeId":   body["placeId"],
                "timestamp": now,
                "stars":     Decimal(str(body.get("stars", 3))),
                "tag":       body.get("tag", ""),
                "username":  body.get("username", "anon"),
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
