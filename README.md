# 🏫 SNU Campus Exchange

> Every place on campus has a live pulse: crowd, people, and lost & found.

**Track:** Campus Reimagined

## Key Features

| Feature | Description |
|---|---|
| **Live Market** | Buy and sell shares of campus places; prices move with real crowd data |
| **Real-time Crowd** | See which places are Quiet, Busy, or Packed right now |
| **Lost & Found** | Report and find lost items tied to campus places, with photo uploads |
| **Place Ratings** | Rate places after check-in with 1-5 stars and tags (Clean, Slow, Noisy, Great) |
| **Connect** | Discover students across departments, wave at them, see who's here |
| **Leaderboard** | Compete for the highest net worth across campus |
| **Auth** | @snu.edu.in email/password accounts with PBKDF2 hashing and signed tokens |

## AWS Services

| Service | Purpose |
|---|---|
| **AWS Amplify** | Static site hosting (HTML/CSS/JS) |
| **AWS Lambda** | Serverless backend (Python 3.12, single function) |
| **API Gateway** | HTTP API — one `$default` catch-all route → Lambda |
| **DynamoDB** | 8 on-demand tables (see below) |
| **Amazon S3** | Photo uploads for Lost & Found items (presigned PUT URLs) |

## DynamoDB Tables

| Table | PK | SK | TTL | Notes |
|---|---|---|---|---|
| Players | `username` (S) | — | — | bestScore, displayName |
| Checkins | `placeId` (S) | `timestamp` (N) | `ttl` | username, real flag |
| Profiles | `username` (S) | — | — | department, batch, interests, avatarColor, displayName |
| Memberships | `community` (S) | `username` (S) | — | |
| Waves | `toUser` (S) | `timestamp` (N) | — | fromUser |
| Items | `itemId` (S) | — | — | type, title, placeId, status, imageKey, reportedBy |
| Ratings | `placeId` (S) | `timestamp` (N) | — | stars, tag, username |
| Users | `email` (S) | — | — | name, salt, pwHash, createdAt |

## Live URL

🔗 [https://main.d38e70fyvfmg2o.amplifyapp.com](https://main.d38e70fyvfmg2o.amplifyapp.com/)

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
Browser (Amplify) → HTTP API Gateway ($default → Lambda) → DynamoDB (8 tables)
                                                         → S3 (photo uploads)
```
