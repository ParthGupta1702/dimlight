-- dimlight: Movie Booking System
-- Step 1 schema: only the Movie table (Feature 2: Browse Movies).
-- Theatre, Screen, Showtime, Seat, Booking, Payment, User, Admin come in later steps.

CREATE DATABASE IF NOT EXISTS dimlight;
USE dimlight;

CREATE TABLE IF NOT EXISTS Movie (
  movie_id     INT AUTO_INCREMENT PRIMARY KEY,
  title        VARCHAR(150) NOT NULL,
  genre        VARCHAR(50)  NOT NULL,
  language     VARCHAR(30)  NOT NULL,
  duration_min SMALLINT UNSIGNED NOT NULL,
  poster_url   VARCHAR(500),
  description  TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_movie_genre (genre),
  INDEX idx_movie_language (language)
);
