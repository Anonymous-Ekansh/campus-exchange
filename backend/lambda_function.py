"""
SNU Campus Exchange – single Lambda handler for HTTP API Gateway.
Region: ap-south-1 | Runtime: Python 3.12
"""
import boto3, json, time
from decimal import Decimal
from boto3.dynamodb.conditions import Key, Attr

ddb = boto3.resource("dynamodb", region_name="ap-south-1")
players    = ddb.Table("Players")
checkins   = ddb.Table("Checkins")
profiles   = ddb.Table("Profiles")
memberships = ddb.Table("Memberships")
waves      = ddb.Table("Waves")

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
            items = players.scan().get("Items", [])
            items.sort(key=lambda x: x.get("bestScore", 0), reverse=True)
            top = [{"username": i["username"], "bestScore": i["bestScore"]} for i in items[:10]]
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
            checkins.put_item(Item={
                "placeId":   body["placeId"],
                "timestamp": now,
                "username":  body["username"],
                "ttl":       now + 7200,
            })
            return resp(200, {"success": True})

        # ---------- CROWD ----------
        if route == "GET /crowd":
            cutoff = now - 1800
            items = checkins.scan(FilterExpression=Attr("timestamp").gte(cutoff)).get("Items", [])
            counts = {}
            for i in items:
                pid = i["placeId"]
                counts[pid] = counts.get(pid, 0) + 1
            return resp(200, counts)

        # ---------- HERE ----------
        if route == "GET /here":
            place = qs.get("placeId", "")
            cutoff = now - 1800
            items = checkins.query(
                KeyConditionExpression=Key("placeId").eq(place) & Key("timestamp").gte(cutoff)
            ).get("Items", [])
            users = list({i["username"] for i in items})
            return resp(200, {"users": users})

        # ---------- PROFILE ----------
        if route == "POST /profile":
            profiles.put_item(Item={
                "username":    body["username"],
                "department":  body.get("department", ""),
                "batch":       body.get("batch", ""),
                "interests":   body.get("interests", []),
                "avatarColor": body.get("avatarColor", "#ff3fb4"),
            })
            return resp(200, {"success": True})

        # ---------- STUDENTS ----------
        if route == "GET /students":
            fe_parts, ean, eav = [], {}, {}
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
            items = profiles.scan(**kwargs).get("Items", [])
            return resp(200, items)

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
            items = memberships.scan().get("Items", [])
            counts = {}
            for i in items:
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
            items = waves.query(
                KeyConditionExpression=Key("toUser").eq(user),
                ScanIndexForward=False,
                Limit=20,
            ).get("Items", [])
            out = [{"fromUser": i["fromUser"], "timestamp": i["timestamp"]} for i in items]
            return resp(200, out)

        return resp(404, {"error": "Unknown route: " + route})

    except Exception as e:
        return resp(500, {"error": str(e)})

