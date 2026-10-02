#!/usr/bin/env python3
"""Generate demo-data.json for the Snap STAGING demo seeder.

Produces the people-and-words layer of the demo studio "Amara & Oak
Photography": client names/emails/phones, lead inquiries + reply threads,
project titles/notes, invoice line items, and contract text with
{{merge_fields}}. The id/SQL/R2 layer lives in tools/seed-staging-demo.mjs.

Deterministic: Faker.seed(20261001) (fallback: random.Random(20261001)
over hand-written name pools when faker can't be installed). Dates are
emitted as ISO days relative to the run date so the demo stays fresh while
names/content stay stable across re-runs.

Usage:  python tools/generate-demo-data.py
Output: tools/demo-data.json
"""
import datetime as dt
import json
import os
import random
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_PATH = os.path.join(HERE, "demo-data.json")
SEED = 20261001

# ---------------------------------------------------------------- faker ----
try:
    from faker import Faker  # noqa: F401
except ImportError:
    Faker = None
    try:
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "--quiet", "faker"],
            check=True,
        )
        from faker import Faker
    except Exception as exc:  # pip failed too — hand-written pools below
        print(f"[demo] faker unavailable ({exc}); using fallback name pools")

FIRST_NAMES = [
    "Maya", "Ethan", "Sofia", "Liam", "Ava", "Noah", "Isla", "Owen", "Ruby",
    "Theo", "Nora", "Felix", "Clara", "Jonah", "Priya", "Marcus", "Elena",
    "Tobias", "June", "Rafael", "Amelia", "Kofi", "Lucia", "Silas", "Wren",
]
LAST_NAMES = [
    "Fernando", "Okonkwo", "Whitfield", "Kaplan", "Moreau", "Delgado",
    "Lindqvist", "Baptiste", "Nakamura", "Osei", "Petrov", "Calloway",
    "Ferraro", "Adeyemi", "Sandoval", "Winters", "Hartley", "Mbeki",
    "Rasmussen", "Villanueva",
]
CITIES = [
    "Montclair", "Maplewood", "South Orange", "Ridgewood", "Hoboken",
    "Summit", "Madison", "Cranford", "Verona", "Bloomfield",
]

if Faker is not None:
    Faker.seed(SEED)
    fake = Faker("en_US")

    def person():
        return {
            "name": fake.name(),
            "email": fake.email(),
            "phone": fake.phone_number(),
        }

    def company():
        return fake.company()

    def sentenceish():
        return fake.sentence(nb_words=10, variable_nb_words=True).rstrip(".")
else:
    _rng = random.Random(SEED)

    def person():
        first = _rng.choice(FIRST_NAMES)
        last = _rng.choice(LAST_NAMES)
        dom = random.Random(f"{SEED}:{first}{last}").choice(
            ["gmail.com", "outlook.com", "icloud.com", "yahoo.com", "hey.com"]
        )
        return {
            "name": f"{first} {last}",
            "email": f"{first.lower()}.{last.lower()}@{dom}",
            "phone": f"(973) 555-{_rng.randint(1000, 9899):04d}",
        }

    def company():
        return f"{_rng.choice(['Northwind', 'Beacon', 'Copperline', 'Larkspur', 'Harborlight', 'Fairmont'])} {_rng.choice(['Capital', 'Legal Group', 'Creative', 'Partners', 'Advisory'])}"

    def sentenceish():
        return "We are so excited about this and looking forward to every part of it."


# ------------------------------------------------------------- utilities ---
TODAY = dt.date.today()


def days_ago(n):
    return (TODAY - dt.timedelta(days=n)).isoformat()


def days_ahead(n):
    return (TODAY + dt.timedelta(days=n)).isoformat()


def pretty_day(iso):
    d = dt.date.fromisoformat(iso)
    return d.strftime("%B %-d, %Y") if os.name != "nt" else d.strftime("%B %d, %Y").replace(" 0", " ")


# ---------------------------------------------------------------- content --
# The wedding couple is FIXED so the studio story is coherent: the delivered
# gallery, the paid invoice, and the signed contract all belong to them.
WEDDING_CLIENT = {
    "name": "Priya Fernando",
    "email": "priya+demo@webcules.com",
    "phone": "(973) 555-0142",
    "notes": "Daniel & Priya, married at Willow Creek Estate. Golden-hour couple portraits are the priority; album upgrade + second photographer on the booking.",
}

clients = [WEDDING_CLIENT]

# Family-session client (project 2), corporate client (project 3),
# newborn client (project 4), plus one past client with no active project.
family = person()
family["notes"] = "Two kids (4 and 7). Park session preferred; youngest does better late afternoon."
clients.append(family)

corp = person()
corp["notes"] = "Office manager. Needs 14 headshots for the website relaunch — consistent lighting across the set."
clients.append(corp)

newborn = person()
newborn["notes"] = "Baby due any day; wants the session within the first 10 days. Prefers a warm, quiet studio setup."
clients.append(newborn)

past = person()
past["notes"] = "Autumn minis last year — always first to book the next seasonal date."
clients.append(past)

# ---- leads (7: 3 new, 2 replied, 1 converted, 1 archived) ----
def lead(name_email, event_type, event_day, status, source, message, messages):
    base = {
        "name": name_email["name"],
        "email": name_email["email"],
        "phone": name_email.get("phone"),
        "eventType": event_type,
        "eventDate": event_day,
        "status": status,
        "source": source,
        "message": message,
        "messages": messages,
    }
    return base


def msg(direction, subject, body, days):
    return {"direction": direction, "subject": subject, "body": body, "daysAgo": days}


l1 = person()
leads = [
    lead(
        l1,
        "Wedding",
        days_ahead(10 * 30),
        "new",
        "contact_form",
        f"Hi! We got engaged last month and we're planning a {pretty_day(days_ahead(300))} wedding for about 120 guests in Montclair. "
        "Your Willow Creek gallery stopped us mid-scroll. Do you still have that date open, and what do your collections start at?",
        [msg("in", "Wedding inquiry — Montclair", "Hi! We got engaged last month and we're planning a wedding for about 120 guests in Montclair. Your Willow Creek gallery stopped us mid-scroll. Do you still have our date open, and what do your collections start at?", 1)],
    ),
    lead(
        person(),
        "Family",
        days_ahead(21),
        "new",
        "booking",
        "Hi there — we'd love to book the fall mini for our crew (two kids, one very energetic dog if allowed!). Is the Saturday after next still available?",
        [msg("in", "Fall mini session?", "Hi there — we'd love to book the fall mini for our crew (two kids, one very energetic dog if allowed!). Is the Saturday after next still available?", 0)],
    ),
    lead(
        person(),
        "Corporate headshots",
        days_ahead(35),
        "new",
        "contact_form",
        "Hello — our firm needs updated team headshots for the website relaunch, about 14 people. Could you come on-site, or do you prefer studio? What's your per-person rate?",
        [msg("in", "Team headshots for website relaunch", "Hello — our firm needs updated team headshots for the website relaunch, about 14 people. Could you come on-site, or do you prefer studio? What's your per-person rate?", 3)],
    ),
    lead(
        person(),
        "Newborn",
        days_ahead(14),
        "replied",
        "contact_form",
        "We're expecting our first in a few weeks and love your newborn work. When should we book, and how soon after the birth would the session happen?",
        [
            msg("in", "Newborn session question", "We're expecting our first in a few weeks and love your newborn work. When should we book, and how soon after the birth would the session happen?", 4),
            msg("out", "Re: Newborn session question", "Congratulations! The sweet spot is days 5–10, when babies are sleepiest. I pencil in your due date and we confirm once the little one arrives — the studio stays warm and quiet, and sessions are never rushed.", 4),
        ],
    ),
    lead(
        person(),
        "Engagement",
        days_ahead(60),
        "replied",
        "contact_form",
        "Hi! We're planning our engagement shoot and love the golden, film-like look of your couples work. Are weekends in the park possible?",
        [
            msg("in", "Engagement shoot — park?", "Hi! We're planning our engagement shoot and love the golden, film-like look of your couples work. Are weekends in the park possible?", 6),
            msg("out", "Re: Engagement shoot — park?", "Absolutely — sunset weekends in the park are my favorite. I'd suggest the hour before golden hour so we can wander and let it get prettier as we go. I'll send over a mini guide with outfit ideas!", 5),
            msg("in", "Re: Re: Engagement shoot — park?", "This all sounds perfect. One more thing — could we bring our dog for the last fifteen minutes? He's very photogenic and we'd love him in a few frames.", 0),
        ],
    ),
    lead(
        family,
        "Family",
        days_ago(20),
        "converted",
        "contact_form",
        "Hi! A friend sent me your fall family minis and I fell in love with the warm tones. Two kids, 4 and 7 — the youngest does better late afternoon. Any slots left?",
        [
            msg("in", "Fall family mini?", "Hi! A friend sent me your fall family minis and I fell in love with the warm tones. Two kids, 4 and 7 — the youngest does better late afternoon. Any slots left?", 24),
            msg("out", "Re: Fall family mini?", "Hi! Yes — I have two late-afternoon slots left. The light around 4:30 is gorgeous right now and the park is peak color. Want me to hold one for you?", 24),
            msg("in", "Re: Re: Fall family mini?", "Yes please hold the 4:30! What do we need to bring?", 23),
            msg("out", "Re: Re: Re: Fall family mini?", "Just yourselves and maybe a favorite snack for the 4-year-old — I'll take care of the rest. Booking confirmed; gallery lands about two weeks after.", 22),
        ],
    ),
    lead(
        person(),
        "Birthday party",
        days_ago(90),
        "archived",
        "contact_form",
        "Hi — pricing for a 60th birthday party, roughly 40 guests, evening? Just candids, nothing formal.",
        [
            msg("in", "60th birthday party — candids", "Hi — pricing for a 60th birthday party, roughly 40 guests, evening? Just candids, nothing formal.", 95),
            msg("out", "Re: 60th birthday party — candids", "Hi! For evening candids I'd suggest my two-hour event rate — I float and capture the room as it happens. Dates in that window are still open!", 94),
        ],
    ),
]

# ---- standalone client email thread (no lead — existing client writing in) ----
email_thread = {
    "subject": "Album delivery?",
    "from": WEDDING_CLIENT["email"],
    "fromName": WEDDING_CLIENT["name"],
    "messages": [
        msg(
            "in",
            "Album delivery?",
            "Hi Amara! The gallery made my mother cry (happy tears!). Quick question — when does the album estimate ship, and can we add two pages from the rehearsal dinner?",
            2,
        ),
        msg(
            "out",
            "Re: Album delivery?",
            "Priya! That made my whole week. The album proof lands with you in about ten days, and yes — send me your favorite rehearsal frames and I'll mock up the extra spreads so you can see them in the layout.",
            2,
        ),
        msg(
            "in",
            "Re: Re: Album delivery?",
            "Perfect, will do tonight. Also — my cousin is getting married next spring and asked who our photographer was. I've already sent her your site!",
            0,
        ),
    ],
}

# ---- projects (titles/notes; statuses + wiring live in the .mjs) ----
projects = {
    "wedding": {
        "title": "Daniel & Priya — Willow Creek Estate Wedding",
        "notes": "Full day, second photographer (Jess). Golden-hour portraits on the west lawn at 6:10pm. Delivered gallery + 10-frame sneak peek same night.",
        "eventDaysAgo": 24,
    },
    "family": {
        "title": f"The {family['name'].split()[-1]} Family — Autumn Park Session",
        "notes": "Late-afternoon park mini. Kids warmed up after the snack break — watch the younger one's expressions in the last third of the set.",
        "eventDaysAgo": 8,
    },
    "corporate": {
        "title": f"{company()} — Team Headshots",
        "notes": "14 people, on-site conference room converted to a studio. Consistent lighting set; two rounds for blinkers. Delivering web-ready crops + print masters.",
        "eventDaysAgo": 1,
    },
    "newborn": {
        "title": f"Baby {newborn['name'].split()[-1]} — Newborn Session",
        "notes": "In-studio, day 8. Slept through almost everything — the wrapped poses on the oak blanket are the keepers. Culling done, retouch list flagged.",
        "eventDaysAgo": 12,
    },
}

# ---- invoices (amounts in minor units) ----
invoices = {
    "paid": {
        "number": "AO-0001",
        "status": "paid",
        "issuedDaysAgo": 32,
        "dueDaysAfter": 14,
        "lines": [
            {"description": "Full-day wedding coverage (8 hours)", "qty": 1, "amountMinor": 280000},
            {"description": "Second photographer", "qty": 1, "amountMinor": 45000},
            {"description": "Album credit (30 spreads)", "qty": 1, "amountMinor": 30000},
        ],
        "memo": "Retainer of $500 received 2026 balance applied. Thank you for having us!",
    },
    "open": {
        "number": "AO-0002",
        "status": "sent",
        "issuedDaysAgo": 5,
        "dueDaysAfter": 14,
        "lines": [
            {"description": "Autumn family session (60 minutes)", "qty": 1, "amountMinor": 35000},
            {"description": "Additional retouched image set (10)", "qty": 1, "amountMinor": 7500},
        ],
        "memo": "Gallery upgrades as selected. Thank you!",
    },
    "overdue": {
        "number": "AO-0003",
        "status": "sent",
        "issuedDaysAgo": 34,
        "dueDaysAfter": 14,
        "lines": [
            {"description": "On-site team headshots (3 hours, 14 people)", "qty": 1, "amountMinor": 90000},
            {"description": "Web-ready crop set + usage license", "qty": 1, "amountMinor": 30000},
        ],
        "memo": "Deposit received; balance net 14. PO 2026-118 attached.",
    },
}

# ---- contracts (merge-field templates) ----
contract_wedding = """This agreement is between {{studio_name}} ("the Studio") and {{client_name}} ("the Client") for the wedding photography collection described as {{project_title}}.

Coverage. The Studio will photograph the wedding on {{event_date}} for up to eight (8) hours, including a second photographer, as outlined in the collection details shared with the Client.

Delivery. Edited, gallery-ready images are delivered through a private online gallery within six weeks of the wedding date, with a sneak peek set within 48 hours.

Payment. The retainer reserves the date and is applied toward the total. The remaining balance is due one week before the wedding. Payments may be made by card through the Studio's secure payment links.

Album. Album credit, if included, is redeemed against the Studio's album collections and never expires.

Cancellation. If the Client cancels, the retainer is non-refundable. The Studio will make reasonable efforts to rebook the date. If the Studio cannot attend due to illness, emergency or force majeure, all payments made will be refunded in full within 10 business days, or a comparable replacement photographer may be offered.

Creative license. The Studio retains the copyright in all images and may share selected images for portfolio use unless the Client requests otherwise in writing.

By signing below, both parties agree to these terms."""

contract_portrait = """This portrait session agreement is between {{studio_name}} ("the Studio") and {{client_name}} ("the Client").

Session. The portrait session takes place on {{event_date}} at the agreed location and time. The Studio confirms the date, time, and meeting point by email no later than 48 hours before the session.

Delivery. The Client receives a private online gallery of fully edited images within two weeks of the session. Favorites, downloads, and print releases are managed through the gallery.

Usage. Personal printing and sharing are included. Commercial use of the images requires written permission from the Studio.

Payment. The session fee is due at booking and reserves the date. Additional image sets are invoiced after gallery selection.

Weather. If conditions make outdoor photography unsafe or unreasonably difficult, the Studio and Client will agree on a new date within 60 days at no additional charge.

By signing below, both parties agree to these terms."""

# ------------------------------------------------------------------ emit ---
payload = {
    "seed": SEED,
    "generatedAt": dt.datetime.now().isoformat(timespec="seconds"),
    "faker": Faker is not None,
    "clients": clients,
    "leads": leads,
    "emailThread": email_thread,
    "projects": projects,
    "invoices": invoices,
    "contracts": {"wedding": contract_wedding, "portrait": contract_portrait},
}

with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"[demo] wrote {OUT_PATH}")
print(f"[demo]   clients: {len(clients)}  leads: {len(leads)}  invoices: {len(invoices)}")
print(f"[demo]   faker: {'yes' if Faker is not None else 'NO (fallback pools)'}")
