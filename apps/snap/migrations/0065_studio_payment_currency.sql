-- WEB-352: client payments are charged in the studio's own Stripe account currency
-- (a USD charge on a CAD account costs the studio a conversion fee). Set from the
-- connected account's default_currency; 'usd' until a studio connects.
ALTER TABLE studio_profile ADD COLUMN payment_currency TEXT NOT NULL DEFAULT 'usd';
