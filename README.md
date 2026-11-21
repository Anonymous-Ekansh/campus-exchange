# 🏫 SNU Campus Exchange

> Every place on campus has a live pulse: crowd, people, and lost & found.

**Track:** Campus Reimagined

## Key Features

| Feature | Description |
|---|---|
| **Live Market** | Buy and sell shares of campus places; prices move with real crowd data |
| **Real-time Crowd** | See which places are Quiet, Busy, or Packed right now |
| **Lost & Found** | Report and find lost items tied to campus places |
| **Place Ratings** | Rate places after check-in with 1-5 stars and tags (Clean, Slow, Noisy, Great) |
| **Connect** | Discover students across departments, wave at them, see who's here |
| **Leaderboard** | Compete for the highest net worth across campus |

## AWS Services

| Service | Purpose |
|---|---|
| **AWS Amplify** | Static site hosting (HTML/CSS/JS) |
| **AWS Lambda** | Serverless backend (Python 3.12, single function) |
| **API Gateway** | HTTP API with CORS (18 routes) |
| **DynamoDB** | 7 on-demand tables: Players, Checkins, Profiles, Memberships, Waves, Items, Ratings |

## DynamoDB Tables

| Table | PK | SK | Notes |
|---|---|---|---|
| Players | `username` (S) | — | bestScore |
| Checkins | `placeId` (S) | `timestamp` (N) | TTL on `ttl`, supports `real` flag |
| Profiles | `username` (S) | — | department, batch, interests, avatarColor |
| Memberships | `community` (S) | `username` (S) | |
| Waves | `toUser` (S) | `timestamp` (N) | fromUser |
| Items | `itemId` (S) | — | Lost & Found: type, title, placeId, status |
| Ratings | `placeId` (S) | `timestamp` (N) | stars, tag |

## Live URL

🔗 _Coming soon_

## Local Development

```bash
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080)

### Seed demo data

Open the browser console and run:
```js
seedDemoData()
```
This sends 15 fake check-ins weighted towards the mess and library, so "Packed" shows in the crowd panel.

## Architecture

```
Browser (Amplify) → HTTP API Gateway (CORS: *) → Lambda (Python 3.12) → DynamoDB (7 tables)
```
