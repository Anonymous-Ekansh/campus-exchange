# SNU Campus Exchange

> A real-time, server-authoritative campus pulse and stock exchange for Shiv Nadar University.

**Track:** Campus Reimagined  
**Live URL:** [https://main.d38e70fyvfmg2o.amplifyapp.com](https://main.d38e70fyvfmg2o.amplifyapp.com/)

---

## Overview

SNU Campus Exchange turns the physical university campus into an interactive digital economy and community hub. Every building, dining hall, hostel, library, and sports facility has a live stock price governed by real-time student check-ins, time-of-day demand schedules, and breaking campus news.

Beyond trading, students discover peers across departments, exchange one-click waves, inspect classmates' trading portfolios, locate lost belongings with photo uploads, and check live crowd densities across 36 campus destinations.

---

## Core Features

### 1. Persistent 24/7 Campus Market
- **Real IST Diurnal Clock**: Market runs continuously following Indian Standard Time (UTC+5:30). Category demands reflect real campus routines (academics peak during lectures, dining halls during meals, library in the evening).
- **Deterministic Pricing**: Every player sees identical prices at any given moment calculated via:
  $$\text{Price} = \text{Base} \times (0.6 + \text{Demand}) \times (1 + 0.05 \times \text{Crowd}_{30}) \times (1 + \text{Noise}) \times (1 + \text{Event})$$
- **Permanent Portfolios**: Cash, campus share holdings, and visited places persist permanently in DynamoDB. No daily wipes or score resets.
- **Optimistic Concurrency**: Trades use version-conditioned writes (`ConditionExpression=Attr("version").eq(old_version)`) preventing race conditions and double-spending.

### 2. Live Check-Ins & Discovery Rewards
- **Discovery Bonus**: Exploring and checking in at any of the 36 campus destinations for the first time awards +INR 100 cash to the student's portfolio.
- **Anti-Spam Cooldown**: Enforces a server-side 10-minute (600-second) cooldown per place, returning HTTP 429 when triggered prematurely.
- **Crowd Influence**: Real check-ins double-count toward live crowd density, triggering busy map indicator rings and raising building share values.

### 3. Interactive SVG Campus Map & Walking Avatar
- **Live Vector Campus**: Schematic vector map of Shiv Nadar University featuring 36 campus landmarks, roadways, green spaces, and water bodies.
- **Smooth 60fps Walking Animation**: Clicking any location animates the student avatar along a dashed trajectory path using frame-interpolated motion with bobbing movement.
- **Diurnal Atmospheric Tint**: Canvas tint dynamically transitions based on the real IST sun cycle (dawn, mid-day, sunset, dusk, night).

### 4. Connect Hub & Student Discovery
- **Cross-Department Networking**: Filter student profiles by department, graduation batch, or cross-department interests.
- **Rich Student Detail Modals**: Clicking any student card opens a detailed profile inspection displaying:
  - Department, batch, email, and interest chips.
  - Current trading cash balance and total net worth.
  - Active campus share holdings (e.g. Central Library x 5 shares).
  - Real-time campus check-in location and exploration count.
- **Interactive Waving**: Send instant waves with immediate visual button feedback and badge counters.

### 5. Lost & Found with Photo Uploads
- **Location-Tied Reports**: Report lost or found belongings pegged to specific campus spots.
- **Direct S3 Uploads**: Upload photo attachments securely via Amazon S3 presigned PUT URLs (`image/jpeg`).
- **Map Badge Counters**: Active open item counts render directly on the campus map tiles.
- **Resolution Control**: Only original reporters can mark items as returned or delete listings.

### 6. Place Ratings & Live Leaderboard
- **Ratings & Tag Chips**: Rate campus places on a 1-5 star scale with feedback chips (Clean, Slow, Noisy, Great).
- **Global Leaderboard**: Live ranking of top 10 students across campus, dynamically calculating net worth from cash and real-time market value of share holdings.

---

## Architecture

```
Browser Client (AWS Amplify)
         |
         | HTTPS REST API (JSON)
         v
Amazon API Gateway (HTTP API with $default catch-all route)
         |
         v
AWS Lambda Function (Python 3.12, Region: ap-southeast-2)
         |
         +---> Amazon DynamoDB (8 on-demand tables)
         |        - Portfolios  (permanent balance, holdings, visits)
         |        - Users       (credentials, PBKDF2 hash, salt)
         |        - Checkins    (real-time check-ins, TTL cleanup)
         |        - Profiles    (student directory & interests)
         |        - Items       (lost & found records)
         |        - Ratings     (1-5 star reviews & tags)
         |        - Waves       (student wave notifications)
         |        - Memberships (community connections)
         |
         +---> Amazon S3 (photo storage for lost & found items)
```

---

## DynamoDB Tables

All tables operate on On-Demand (PAY_PER_REQUEST) billing in region `ap-southeast-2`:

| Table | Partition Key (PK) | Sort Key (SK) | TTL Attribute | Description |
|---|---|---|---|---|
| **Portfolios** | `username` (String) | None | None | Stores permanent cash, share holdings, visited places, version |
| **Users** | `email` (String) | None | None | User accounts, salted PBKDF2 password hashes, display names |
| **Checkins** | `placeId` (String) | `timestamp` (Number) | `ttl` | Real check-in records for crowd density and cooldown checks |
| **Profiles** | `username` (String) | None | None | Student directory: department, batch, interests, avatar color |
| **Items** | `itemId` (String) | None | None | Lost & found posts, place references, contact info, photo keys |
| **Ratings** | `placeId` (String) | `timestamp` (Number) | None | Star ratings (1-5) and feedback chips |
| **Waves** | `toUser` (String) | `timestamp` (Number) | None | Social waves sent between students |
| **Memberships** | `community` (String) | `username` (String) | None | Community memberships and affiliations |

---

## API Endpoints

### Public Endpoints
- `POST /signup`: Register account with @snu.edu.in email, name, password (min 6 chars).
- `POST /login`: Authenticate and receive HMAC-SHA256 signed session token (7-day validity).
- `GET /crowd`: Active check-in counts per place in the last 30 minutes.
- `GET /leaderboard`: Top 10 players ranked by live portfolio net worth.

### Authenticated Endpoints (`Authorization: Bearer <token>`)
- `GET /prices`: Real-time deterministic prices for all 36 places, hourly news, IST time.
- `GET /portfolio`: User cash, share holdings, visited places, and calculated net worth.
- `POST /trade`: Buy or sell campus shares (`placeId`, `side: buy/sell`, `qty: 1-100`).
- `POST /checkin`: Record physical presence (`placeId`, `real: true`), awards INR 100 first-time bonus.
- `GET /here`: List of students checked in at a place within the last 30 minutes.
- `POST /profile`: Save student profile (department, batch, interests, avatar color).
- `GET /students`: Search and filter student profiles by department, batch, or interest.
- `GET /student-detail`: Inspect student trading cash, net worth, holdings, and check-in location.
- `POST /wave`: Send a wave to another student.
- `GET /waves`: Retrieve waves received by current user.
- `POST /upload-url`: Generate presigned Amazon S3 PUT URL for photo uploads.
- `POST /items`: Create lost or found report with optional imageKey.
- `GET /items`: Fetch lost and found listings filtered by place, status, or type.
- `POST /items/resolve`: Mark reported item as returned (reporter only).
- `POST /items/delete`: Delete reported item (reporter only).
- `POST /rating`: Submit star rating and tag chip for a place.
- `GET /ratings`: Retrieve average rating and top tag for a place.

---

## Local Development

```bash
# 1. Clone repository
git clone https://github.com/Anonymous-Ekansh/campus-exchange.git
cd campus-exchange

# 2. Run local web server
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

---

## Security & Reliability

- **Authentication**: Salted PBKDF2 password hashing (100,000 iterations); stateless HMAC-SHA256 bearer tokens with 7-day expiration.
- **Input Sanitization**: User-generated text (names, titles, descriptions) is sanitized against XSS injection before rendering.
- **Server Authority**: Stock prices and trade execution are strictly evaluated on the server; clients cannot spoof prices or balances.
- **Resilient Media Pipeline**: Lost & found reports save successfully even if photo uploads fail or encounter client network restrictions.
- **CORS Support**: API Gateway automatically handles preflight `OPTIONS` requests across all routes.
