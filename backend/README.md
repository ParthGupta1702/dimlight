# dimlight

Movie Booking System (INT3131): Node.js + Express + MongoDB REST API (all 11 SRS features) plus the website,
served from the same server. No build step: open http://localhost:5000 after `npm run dev`.

## Run (Windows PowerShell)
MongoDB runs in a container through Docker Desktop, so you don't install it. Start Docker Desktop first and wait
until it says it is running.
```powershell
cd C:\Users\VICTUS\Desktop\dimlight\backend
npm install
Copy-Item .env.example .env      # then edit .env: set JWT_SECRET (the default MONGODB_URI already fits Docker)
npm run db:up                    # starts MongoDB in Docker and waits until it is ready
npm run db:setup                 # wipes the dimlight database, then seeds admin, theatres, seats, movies, showtimes
npm run dev                      # website + API on http://localhost:5000  (open it in your browser)
npm run test:smoke               # (in a 2nd terminal) checks all features, including a double-booking race
```
`db:setup` DROPS and recreates the `dimlight` database - use it for development only.
Seeded admin: `admin@dimlight.com` / `Admin@12345` (change in `.env` before running setup).

### Docker commands
| Command | What it does |
|---|---|
| `npm run db:up` | Start MongoDB (first run downloads the `mongo:7` image) |
| `npm run db:down` | Stop it. Your data is kept in the Docker volume `dimlight-mongo-data` |
| `npm run db:logs` | Watch MongoDB's log |
| `docker compose down -v` | Stop it AND delete all data |

Port 27017 already in use? A MongoDB installed on Windows is probably running. Stop that service, or change the left
number in `docker-compose.yml` (for example `"27018:27017"`) and set `MONGODB_URI=mongodb://127.0.0.1:27018/dimlight`.
To look at the data, open MongoDB Compass and connect to `mongodb://127.0.0.1:27017`.

## Database design (MongoDB)
| Collection | Notes |
|---|---|
| `users`, `admins` | bcrypt password hashes, unique email |
| `movies` | title, genre, language, duration, poster |
| `theatres` | name, city |
| `screens` | belongs to a theatre; the fixed **Seat** inventory is embedded as `seats: [{row, number, label}]` |
| `showtimes` | one movie + one screen, `start_at`, `end_at`, price |
| `bookings` | user, showtime, `seats: ["A5","A6"]`, status, total, hold expiry; the **Payment** is embedded as `payment` |
| `seatlocks` | one document per held or paid seat per showtime |

**No double-booking:** `seatlocks` has a unique index on (showtime, seat) that only applies while `active: true`.
MongoDB itself rejects a second lock for the same seat, even if two requests arrive at the same instant, so no
transactions (and no replica set) are needed. Paying, cancelling and expiring use one atomic update each that
checks the booking's current status. Ids are MongoDB ObjectIds (24 hex characters); a seat's id is its label, e.g. `A5`.

## Endpoints
Send `Authorization: Bearer <token>` where marked. Errors are `{ "error": "message" }`.

| Feature | Method & route | Who |
|---|---|---|
| 1 Register/Login | `POST /api/auth/register` `{name,email,password}` | public |
| | `POST /api/auth/login` `{email,password}` | public |
| | `GET /api/auth/me` | token |
| 8 Admin login | `POST /api/auth/admin/login` | public |
| 2 Browse movies | `GET /api/movies?genre=&language=&search=` | public |
| | `GET /api/movies/filters`, `GET /api/movies/:id` | public |
| | `GET /api/movies/featured` (hero: featured movies with next show and lowest price) | public |
| 3 Showtimes | `GET /api/movies/:id/showtimes?date=YYYY-MM-DD` (grouped by date) | public |
| | `GET /api/showtimes/:id`, `GET /api/theatres` | public |
| 4 Seats | `GET /api/showtimes/:id/seats` (available/held/yours/booked) | public (token optional) |
| | `GET /api/showtimes/:id/seats/stream` (live updates, SSE) | public |
| 5 Book | `POST /api/bookings` `{showtime_id, seat_ids:["A5","A6"]}` holds seats 5 min | user |
| 6 Mock pay | `POST /api/bookings/:id/pay` `{method: card\|upi\|netbanking\|wallet}` | user |
| | `POST /api/bookings/:id/cancel` (unpaid only) | user |
| 7 History / e-ticket | `GET /api/bookings/my?status=`, `GET /api/bookings/:id` | user |
| 9 Manage movies | `POST /api/movies`, `PUT /api/movies/:id` (incl. `featured: true/false`), `DELETE /api/movies/:id` | admin |
| 10 Manage showtimes | `POST /api/showtimes` `{movie_id,screen_id,date,time,price}`, `PUT /api/showtimes/:id` | admin |
| 11 All bookings | `GET /api/admin/bookings?status=&movie_id=&date=&search=&page=&limit=` | admin |
| Animation tokens | `GET /api/ui/motion` | public |

## Smooth-feel features for the frontend
- **Live seat map**: `new EventSource('/api/showtimes/ID/seats/stream')`, listen for `seats` events
  `{seat_ids, status}` and animate those seats. EventSource can't send headers, so nothing here needs a token.
- **Seat hold + countdown**: booking returns `hold_seconds_left`; seats free automatically when it hits 0.
- **Re-picking seats** replaces your previous unpaid selection instantly (no "seat taken by you" errors).
- **Payment delay**: `MOCK_PAYMENT_DELAY_MS` (default 1200) so a processing animation has time to play.
- **Motion tokens**: `GET /api/ui/motion` returns durations, easings, stagger delays and per-component
  transitions so every screen animates consistently. `availability` on showtimes
  (`available | filling_fast | sold_out`) drives badges.

## Rules enforced
Unique emails, bcrypt hashes, JWT expiry (2h), parameterised SQL, admin-only writes, users see only their own
bookings (BR-4), no double-booking even under simultaneous requests (BR-1), only Paid = confirmed (BR-2),
no overlapping shows on a screen (+15 min changeover), max 6 seats per booking.

## Frontend (`public/`)
Plain HTML, CSS and JavaScript modules, no build tools. Look follows the Concession Stand design in the project
(tomato red, cream, butter yellow, striped awning cards, scalloped header edge).

| Page (hash route) | What it does |
|---|---|
| `#/` | Hero marquee rotating featured movies, then the movie grid with search, genre chips, language filter |
| `#/movie/:id` | Details and showtimes by day, grouped by theatre and screen |
| `#/showtime/:id` | Live seat map (updates when others hold or buy seats), up to 6 seats |
| `#/checkout/:id` | Countdown ring for the seat hold, mock payment, success animation |
| `#/ticket/:id` | E-ticket stub with booking reference, printable |
| `#/bookings` | Your booking history |
| `#/login`, `#/admin/login` | Customer and staff sign in |
| `#/admin/bookings`, `#/admin/movies`, `#/admin/showtimes` | Admin: all bookings, manage movies, manage showtimes |

Animation timings come from `GET /api/ui/motion` and become CSS variables, so changing `src/config/motion.js`
retunes the whole site. `prefers-reduced-motion` is respected.
