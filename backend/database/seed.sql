-- Sample movies so Browse Movies has something to show.
USE dimlight;

INSERT INTO Movie (title, genre, language, duration_min, poster_url, description) VALUES
('Interstellar',      'Sci-Fi',   'English', 169, 'https://placehold.co/300x450?text=Interstellar', 'Explorers travel through a wormhole to save humanity.'),
('3 Idiots',          'Comedy',   'Hindi',   170, 'https://placehold.co/300x450?text=3+Idiots',     'Two friends search for their long-lost college buddy.'),
('The Dark Knight',   'Action',   'English', 152, 'https://placehold.co/300x450?text=Dark+Knight',  'Batman faces the Joker in Gotham City.'),
('Dangal',            'Drama',    'Hindi',   161, 'https://placehold.co/300x450?text=Dangal',       'A father trains his daughters to become wrestlers.'),
('Baahubali 2',       'Action',   'Telugu',  167, 'https://placehold.co/300x450?text=Baahubali+2',  'Why did Kattappa kill Baahubali?'),
('Inside Out',        'Animation','English',  95, 'https://placehold.co/300x450?text=Inside+Out',   'The emotions inside a young girl''s mind.');
