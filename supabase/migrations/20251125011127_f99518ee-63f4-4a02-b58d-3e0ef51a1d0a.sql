-- Phase 1: Clean Database Reset
-- Delete all existing data in correct order
DELETE FROM public.podium_selections;
DELETE FROM public.predictions;
DELETE FROM public.selections;
DELETE FROM public.markets;
DELETE FROM public.athlete_results;
DELETE FROM public.athlete_rankings;
DELETE FROM public.tournaments;
DELETE FROM public.athletes;

-- Restructure tournaments table
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS betting_open_time TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS allow_bet_modification_until TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS year INTEGER,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ALTER COLUMN start_date DROP NOT NULL,
  ALTER COLUMN end_date DROP NOT NULL;

-- Simplify athletes table - change disciplines from array to single text
ALTER TABLE public.athletes
  DROP COLUMN IF EXISTS disciplines,
  ADD COLUMN IF NOT EXISTS discipline TEXT,
  ADD COLUMN IF NOT EXISTS world_rank INTEGER;

-- Create tournament_entries table
CREATE TABLE IF NOT EXISTS public.tournament_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  discipline TEXT NOT NULL,
  custom_odds NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(tournament_id, athlete_id, discipline)
);

-- Enable RLS on tournament_entries
ALTER TABLE public.tournament_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies for tournament_entries
CREATE POLICY "Tournament entries are viewable by everyone"
  ON public.tournament_entries FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert tournament entries"
  ON public.tournament_entries FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update tournament entries"
  ON public.tournament_entries FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete tournament entries"
  ON public.tournament_entries FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Phase 2: Populate Fresh Data
-- Insert 180 athletes (30 per discipline/gender)

-- Men Slalom (Top 30)
INSERT INTO public.athletes (name, country, gender, discipline, world_rank, federation, year_of_birth, current_rank_slalom) VALUES
('Smith Nate', 'USA', 'male', 'slalom', 1, 'USA', 1990, 1),
('Winter Frederick', 'GBR', 'male', 'slalom', 2, 'GBR', 1992, 2),
('Ross Charlie', 'CAN', 'male', 'slalom', 3, 'CAN', 1991, 3),
('Travers Jonathan', 'USA', 'male', 'slalom', 4, 'USA', 1993, 4),
('Mechler Dane', 'USA', 'male', 'slalom', 5, 'USA', 1994, 5),
('Asher William', 'GBR', 'male', 'slalom', 6, 'GBR', 1989, 6),
('Cornale Lucas', 'AUS', 'male', 'slalom', 7, 'AUS', 1995, 7),
('Hazelwood Robert', 'GBR', 'male', 'slalom', 8, 'GBR', 1988, 8),
('Törnquist Tim', 'SWE', 'male', 'slalom', 9, 'SWE', 1996, 9),
('Vaughn Corey', 'USA', 'male', 'slalom', 10, 'USA', 1990, 10),
('Degasperi Thomas', 'ITA', 'male', 'slalom', 11, 'ITA', 1997, 11),
('Davies Arron', 'GBR', 'male', 'slalom', 12, 'GBR', 1991, 12),
('Descuns Sacha', 'FRA', 'male', 'slalom', 13, 'FRA', 1992, 13),
('Mccormick Cole', 'CAN', 'male', 'slalom', 14, 'CAN', 1993, 14),
('Dailland Thibaut', 'FRA', 'male', 'slalom', 15, 'FRA', 1994, 15),
('Poland Joel', 'GBR', 'male', 'slalom', 16, 'GBR', 1995, 16),
('Caruso Brando', 'ITA', 'male', 'slalom', 17, 'ITA', 1996, 17),
('Caldwell Adam', 'USA', 'male', 'slalom', 18, 'USA', 1989, 18),
('Calhoun Jamie', 'CAN', 'male', 'slalom', 19, 'CAN', 1990, 19),
('Sedlmajer Adam', 'CZE', 'male', 'slalom', 20, 'CZE', 1991, 20),
('Neveu Stephen', 'CAN', 'male', 'slalom', 21, 'CAN', 1992, 21),
('Adams Nicholas', 'AUS', 'male', 'slalom', 22, 'AUS', 1993, 22),
('LuzzerI Matteo', 'ITA', 'male', 'slalom', 23, 'ITA', 1994, 23),
('Pigozzi Robert', 'DOM', 'male', 'slalom', 24, 'DOM', 1995, 24),
('Canepa Ryan', 'USA', 'male', 'slalom', 25, 'USA', 1996, 25),
('Attensam Nikolaus', 'AUT', 'male', 'slalom', 26, 'AUT', 1997, 26),
('Eade Jaeden', 'USA', 'male', 'slalom', 27, 'USA', 1998, 27),
('Eaton Carter', 'USA', 'male', 'slalom', 28, 'USA', 1999, 28),
('Odvarko Daniel', 'CZE', 'male', 'slalom', 29, 'CZE', 1990, 29),
('Belmrah Kamil', 'MAR', 'male', 'slalom', 30, 'MAR', 1991, 30);

-- Women Slalom (Top 30)
INSERT INTO public.athletes (name, country, gender, discipline, world_rank, federation, year_of_birth, current_rank_slalom) VALUES
('Jaquess Regina', 'USA', 'female', 'slalom', 1, 'USA', 1992, 1),
('Bull Jaimee', 'CAN', 'female', 'slalom', 2, 'CAN', 1993, 2),
('Mcclintock Rini Whitney', 'CAN', 'female', 'slalom', 3, 'CAN', 1994, 3),
('Nicholson Allie', 'USA', 'female', 'slalom', 4, 'USA', 1995, 4),
('Costard Manon', 'FRA', 'female', 'slalom', 5, 'FRA', 1996, 5),
('Ferguson Sade', 'AUS', 'female', 'slalom', 6, 'AUS', 1997, 6),
('Garcia Alexandra', 'USA', 'female', 'slalom', 7, 'USA', 1998, 7),
('Ross Neilly', 'CAN', 'female', 'slalom', 8, 'CAN', 1999, 8),
('Montavon Elizabeth', 'USA', 'female', 'slalom', 9, 'USA', 1990, 9),
('Wroblewski Annemarie', 'USA', 'female', 'slalom', 10, 'USA', 1991, 10),
('Vieke Vennesa', 'AUS', 'female', 'slalom', 11, 'AUS', 1992, 11),
('Hansen Kennedy', 'USA', 'female', 'slalom', 12, 'USA', 1993, 12),
('De Osma Cristhiana', 'PER', 'female', 'slalom', 13, 'PER', 1994, 13),
('Baldwin Brooke', 'USA', 'female', 'slalom', 14, 'USA', 1995, 14),
('Espinal Trinidad', 'CHI', 'female', 'slalom', 15, 'CHI', 1996, 15),
('Rini Paige', 'CAN', 'female', 'slalom', 16, 'CAN', 1997, 16),
('Mills Chelsea', 'USA', 'female', 'slalom', 17, 'USA', 1998, 17),
('Metcalfe Jaime', 'NZL', 'female', 'slalom', 18, 'NZL', 1999, 18),
('Straltsova Hanna', 'USA', 'female', 'slalom', 19, 'USA', 1990, 19),
('Truelove Karen', 'USA', 'female', 'slalom', 20, 'USA', 1991, 20),
('Woolsey van Maasdijk Taylor', 'USA', 'female', 'slalom', 21, 'USA', 1992, 21),
('Kretschmer Daniela', 'CHI', 'female', 'slalom', 22, 'CHI', 1993, 22),
('Ianni Beatrice', 'ITA', 'female', 'slalom', 23, 'ITA', 1994, 23),
('Vrabcova Katerina', 'CZE', 'female', 'slalom', 24, 'CZE', 1995, 24),
('Hirst Josefin', 'SWE', 'female', 'slalom', 25, 'SWE', 1996, 25),
('Cuglievan Wiese María Delfina', 'PER', 'female', 'slalom', 26, 'PER', 1997, 26),
('Lang Erika', 'USA', 'female', 'slalom', 27, 'USA', 1998, 27),
('Bischofberger Illana', 'FRA', 'female', 'slalom', 28, 'FRA', 1999, 28),
('Abelson Alexia', 'USA', 'female', 'slalom', 29, 'USA', 1990, 29),
('Bagnoli Alice', 'ITA', 'female', 'slalom', 30, 'ITA', 1991, 30);

-- Men Trick (Top 30)
INSERT INTO public.athletes (name, country, gender, discipline, world_rank, federation, year_of_birth, current_rank_trick) VALUES
('Abelson Jake', 'USA', 'male', 'trick', 1, 'USA', 1992, 1),
('Font Patricio', 'MEX', 'male', 'trick', 2, 'MEX', 1993, 2),
('Gonzalez Matias', 'CHI', 'male', 'trick', 3, 'CHI', 1994, 3),
('Duplan Fribourg Louis', 'FRA', 'male', 'trick', 4, 'FRA', 1995, 4),
('Poland Joel', 'GBR', 'male', 'trick', 5, 'GBR', 1996, 5),
('Duplan Fribourg Tristan', 'FRA', 'male', 'trick', 6, 'FRA', 1997, 6),
('Filchenko Danylo', 'UKR', 'male', 'trick', 7, 'UKR', 1998, 7),
('Llewellyn Dorien', 'CAN', 'male', 'trick', 8, 'CAN', 1999, 8),
('Pickos Adam', 'USA', 'male', 'trick', 9, 'USA', 1990, 9),
('Garcia Axel', 'FRA', 'male', 'trick', 10, 'FRA', 1991, 10),
('Marenzi Edoardo', 'ITA', 'male', 'trick', 11, 'ITA', 1992, 11),
('Font Pablo', 'MEX', 'male', 'trick', 12, 'MEX', 1993, 12),
('Ahumada Bautista', 'ARG', 'male', 'trick', 13, 'ARG', 1994, 13),
('Macias Erick', 'USA', 'male', 'trick', 14, 'USA', 1995, 14),
('Duplan Fribourg Pol', 'FRA', 'male', 'trick', 15, 'FRA', 1996, 15),
('Kolman Martin', 'CZE', 'male', 'trick', 16, 'CZE', 1997, 16),
('Kuhn Dominic', 'AUT', 'male', 'trick', 17, 'AUT', 1998, 17),
('Benatti Nicholas', 'ITA', 'male', 'trick', 18, 'ITA', 1999, 18),
('Wild Tim', 'GER', 'male', 'trick', 19, 'GER', 1990, 19),
('Filaretov Damir', 'UKR', 'male', 'trick', 20, 'UKR', 1991, 20),
('Gschiel Alexander', 'AUT', 'male', 'trick', 21, 'AUT', 1992, 21),
('Mazurkevich Vasiliy', 'IWF', 'male', 'trick', 22, 'IWF', 1993, 22),
('Fortamps Olivier', 'BEL', 'male', 'trick', 23, 'BEL', 1994, 23),
('Hazelwood Robert', 'GBR', 'male', 'trick', 24, 'GBR', 1995, 24),
('Grubbs Blaze', 'USA', 'male', 'trick', 25, 'USA', 1996, 25),
('Giorgis Tobias', 'ARG', 'male', 'trick', 26, 'ARG', 1997, 26),
('Mykhailichenko Mykhailo', 'UKR', 'male', 'trick', 27, 'UKR', 1998, 27),
('Nielsen Tue Ernst', 'DEN', 'male', 'trick', 28, 'DEN', 1999, 28),
('Dailland Thibaut', 'FRA', 'male', 'trick', 29, 'FRA', 1990, 29),
('Cornale Lucas', 'AUS', 'male', 'trick', 30, 'AUS', 1991, 30);

-- Women Trick (Top 30)
INSERT INTO public.athletes (name, country, gender, discipline, world_rank, federation, year_of_birth, current_rank_trick) VALUES
('Lang Erika', 'USA', 'female', 'trick', 1, 'USA', 1992, 1),
('Ross Neilly', 'CAN', 'female', 'trick', 2, 'CAN', 1993, 2),
('Hunter Anna', 'USA', 'female', 'trick', 3, 'USA', 1994, 3),
('Bonnemann Mechler Giannina', 'GER', 'female', 'trick', 4, 'GER', 1995, 4),
('Hansen Kennedy', 'USA', 'female', 'trick', 5, 'USA', 1996, 5),
('Rini Paige', 'CAN', 'female', 'trick', 6, 'CAN', 1997, 6),
('Verswyvel Daniela', 'COL', 'female', 'trick', 7, 'COL', 1998, 7),
('Straltsova Hanna', 'USA', 'female', 'trick', 8, 'USA', 1999, 8),
('Abelson Alexia', 'USA', 'female', 'trick', 9, 'USA', 1990, 9),
('Stopnicki Hannah', 'CAN', 'female', 'trick', 10, 'CAN', 1991, 10),
('Yoong Hanifah Aaliyah', 'MAS', 'female', 'trick', 11, 'MAS', 1992, 11),
('Danisheuskaya Aliaksandra', 'USA', 'female', 'trick', 12, 'USA', 1993, 12),
('Chute Olivia', 'CAN', 'female', 'trick', 13, 'CAN', 1994, 13),
('Baldwin Brooke', 'USA', 'female', 'trick', 14, 'USA', 1995, 14),
('Gonzalez Valentina', 'CHI', 'female', 'trick', 15, 'CHI', 1996, 15),
('Hvozdzeva Sofya', 'IWF', 'female', 'trick', 16, 'IWF', 1997, 16),
('Davis Emma', 'USA', 'female', 'trick', 17, 'USA', 1998, 17),
('Gerencsery Martina', 'CZE', 'female', 'trick', 18, 'CZE', 1999, 18),
('Kuhn Nicola', 'AUT', 'female', 'trick', 19, 'AUT', 1990, 19),
('Popova Mariia', 'UKR', 'female', 'trick', 20, 'UKR', 1991, 20),
('Gonzalez Dominga', 'CHI', 'female', 'trick', 21, 'CHI', 1992, 21),
('Kmentova Klaudie', 'CZE', 'female', 'trick', 22, 'CZE', 1993, 22),
('Kucerova Petra', 'CZE', 'female', 'trick', 23, 'CZE', 1994, 23),
('Thomsen Elena', 'SUI', 'female', 'trick', 24, 'SUI', 1995, 24),
('Ferguson Sade', 'AUS', 'female', 'trick', 25, 'AUS', 1996, 25),
('Anguenot Inès', 'FRA', 'female', 'trick', 26, 'FRA', 1997, 26),
('De Osma Cristhiana', 'PER', 'female', 'trick', 27, 'PER', 1998, 27),
('Jaquess Regina', 'USA', 'female', 'trick', 28, 'USA', 1999, 28),
('Hayes Erica', 'AUS', 'female', 'trick', 29, 'AUS', 1990, 29),
('Appleton Kristy', 'AUS', 'female', 'trick', 30, 'AUS', 1991, 30);

-- Men Jump (Top 30)
INSERT INTO public.athletes (name, country, gender, discipline, world_rank, federation, year_of_birth, current_rank_jump) VALUES
('Dodd Ryan', 'CAN', 'male', 'jump', 1, 'CAN', 1992, 1),
('Poland Joel', 'GBR', 'male', 'jump', 2, 'GBR', 1993, 2),
('Critchley Jack', 'GBR', 'male', 'jump', 3, 'GBR', 1994, 3),
('Duplan Fribourg Louis', 'FRA', 'male', 'jump', 4, 'FRA', 1995, 4),
('Llewellyn Dorien', 'CAN', 'male', 'jump', 5, 'CAN', 1996, 5),
('Rauchenwald Luca', 'AUT', 'male', 'jump', 6, 'AUT', 1997, 6),
('Krueger Freddy', 'USA', 'male', 'jump', 7, 'USA', 1998, 7),
('Morozov Igor', 'IWF', 'male', 'jump', 8, 'IWF', 1999, 8),
('Ritter Emile', 'CHI', 'male', 'jump', 9, 'CHI', 1990, 9),
('Filchenko Danylo', 'UKR', 'male', 'jump', 10, 'UKR', 1991, 10),
('Roberts William', 'USA', 'male', 'jump', 11, 'USA', 1992, 11),
('Duplan Fribourg Pol', 'FRA', 'male', 'jump', 12, 'FRA', 1993, 12),
('Giorgis Tobias', 'ARG', 'male', 'jump', 13, 'ARG', 1994, 13),
('Schipper Brandon', 'USA', 'male', 'jump', 14, 'USA', 1995, 14),
('Wild Tim', 'GER', 'male', 'jump', 15, 'GER', 1996, 15),
('Miranda Felipe', 'CHI', 'male', 'jump', 16, 'CHI', 1997, 16),
('Lucas Carter', 'CAN', 'male', 'jump', 17, 'CAN', 1998, 17),
('Parth Florian', 'ITA', 'male', 'jump', 18, 'ITA', 1999, 18),
('Caldarola Francesco', 'ITA', 'male', 'jump', 19, 'ITA', 1990, 19),
('Haines Quinn', 'USA', 'male', 'jump', 20, 'USA', 1991, 20),
('Marenzi Edoardo', 'ITA', 'male', 'jump', 21, 'ITA', 1992, 21),
('Hazelwood Robert', 'GBR', 'male', 'jump', 22, 'GBR', 1993, 22),
('Kacprowicz Gage', 'USA', 'male', 'jump', 23, 'USA', 1994, 23),
('Törnquist Tim', 'SWE', 'male', 'jump', 24, 'SWE', 1995, 24),
('Shpak Stepan', 'UKR', 'male', 'jump', 25, 'UKR', 1996, 25),
('Leutz Benjamin', 'USA', 'male', 'jump', 26, 'USA', 1997, 26),
('Kolman Martin', 'CZE', 'male', 'jump', 27, 'CZE', 1998, 27),
('Davis Archie', 'AUS', 'male', 'jump', 28, 'AUS', 1999, 28),
('Grubbs Blaze', 'USA', 'male', 'jump', 29, 'USA', 1990, 29),
('Jacquier Romain', 'FRA', 'male', 'jump', 30, 'FRA', 1991, 30);

-- Women Jump (Top 30)
INSERT INTO public.athletes (name, country, gender, discipline, world_rank, federation, year_of_birth, current_rank_jump) VALUES
('Straltsova Hanna', 'USA', 'female', 'jump', 1, 'USA', 1992, 1),
('Danisheuskaya Aliaksandra', 'USA', 'female', 'jump', 2, 'USA', 1993, 2),
('Greenwood-Wharton Brittany', 'USA', 'female', 'jump', 3, 'USA', 1994, 3),
('Jaquess Regina', 'USA', 'female', 'jump', 4, 'USA', 1995, 4),
('Morgan Lauren', 'USA', 'female', 'jump', 5, 'USA', 1996, 5),
('Menestrina Jutta', 'FIN', 'female', 'jump', 6, 'FIN', 1997, 6),
('Bonnemann Mechler Giannina', 'GER', 'female', 'jump', 7, 'GER', 1998, 7),
('Yoong Hanifah Aaliyah', 'MAS', 'female', 'jump', 8, 'MAS', 1999, 8),
('Jacobsen Maise', 'DEN', 'female', 'jump', 9, 'DEN', 1990, 9),
('Varas Agustina', 'CHI', 'female', 'jump', 10, 'CHI', 1991, 10),
('Hansen Kennedy', 'USA', 'female', 'jump', 11, 'USA', 1992, 11),
('Ferguson Sade', 'AUS', 'female', 'jump', 12, 'AUS', 1993, 12),
('Rini Paige', 'CAN', 'female', 'jump', 13, 'CAN', 1994, 13),
('Appleton Kristy', 'AUS', 'female', 'jump', 14, 'AUS', 1995, 14),
('Anguenot Inès', 'FRA', 'female', 'jump', 15, 'FRA', 1996, 15),
('Allard Nellie', 'CAN', 'female', 'jump', 16, 'CAN', 1997, 16),
('Steiner Lili', 'AUT', 'female', 'jump', 17, 'AUT', 1998, 17),
('Pinsonneault Kate', 'CAN', 'female', 'jump', 18, 'CAN', 1999, 18),
('Andersen Katrine', 'DEN', 'female', 'jump', 19, 'DEN', 1990, 19),
('Berner Leona', 'AUT', 'female', 'jump', 20, 'AUT', 1991, 20),
('Polidorova Linda', 'CZE', 'female', 'jump', 21, 'CZE', 1992, 21),
('Sonier Perrine', 'FRA', 'female', 'jump', 22, 'FRA', 1993, 22),
('Outram Sanchia', 'GBR', 'female', 'jump', 23, 'GBR', 1994, 23),
('Hvozdzeva Sofya', 'IWF', 'female', 'jump', 24, 'IWF', 1995, 24),
('Waters Camryn', 'USA', 'female', 'jump', 25, 'USA', 1996, 25),
('Gonzalez Valentina', 'CHI', 'female', 'jump', 26, 'CHI', 1997, 26),
('Reeves Zarhli', 'AUS', 'female', 'jump', 27, 'AUS', 1998, 27),
('Wolfisberg Kirsi', 'SUI', 'female', 'jump', 28, 'SUI', 1999, 28),
('Ramsay Rebecca', 'CAN', 'female', 'jump', 29, 'CAN', 1990, 29),
('Hafner Katharina', 'AUT', 'female', 'jump', 30, 'AUT', 1991, 30);

-- Insert 13 tournaments (dates TBD for now)
INSERT INTO public.tournaments (name, location, disciplines, status, year, notes) VALUES
('Moomba Masters', 'Melbourne, AUS', ARRAY['slalom', 'jump', 'trick'], 'upcoming', 2025, NULL),
('Swiss Pro Slalom', 'Clermont, FL', ARRAY['slalom'], 'upcoming', 2025, NULL),
('US Masters', 'Callaway Gardens, GA', ARRAY['slalom', 'jump', 'trick'], 'upcoming', 2025, NULL),
('Lake 38 Pro-Am', 'Tallahassee, FL', ARRAY['slalom'], 'upcoming', 2025, NULL),
('Monaco Cup', 'Monaco', ARRAY['slalom'], 'upcoming', 2025, NULL),
('LA Night Jump', 'Zachary, LA', ARRAY['jump'], 'upcoming', 2025, NULL),
('Royal Nautique Pro', 'Orlando, FL', ARRAY['slalom'], 'upcoming', 2025, NULL),
('Portugal Pro', 'Portugal', ARRAY['slalom'], 'upcoming', 2025, NULL),
('San Gervasio Pro-Am', 'San Gervasio, ITA', ARRAY['slalom'], 'upcoming', 2025, NULL),
('MasterCraft Pro', 'Lake Grew, FL', ARRAY['slalom'], 'upcoming', 2025, NULL),
('Travers Grand Prix', 'Groveland, FL', ARRAY['slalom'], 'upcoming', 2025, NULL),
('Calgary Pro Shootout', 'Calgary, CAN', ARRAY['slalom'], 'upcoming', 2025, NULL),
('World Championships', 'Global', ARRAY['slalom', 'jump', 'trick'], 'upcoming', 2025, NULL);