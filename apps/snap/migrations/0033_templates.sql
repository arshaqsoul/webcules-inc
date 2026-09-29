-- WEB-247: template store — contract templates, form schemas, email
-- snippets, invoice presets, questionnaires. One table, kind-discriminated;
-- body is JSON (form-like kinds) or sanitized HTML / plain text (documents).
CREATE TABLE template (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  is_default INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX template_org_kind_idx ON template(organization_id, kind, archived_at);

-- Starter library for every studio that already exists. New orgs get the
-- same rows through the onboarding hook (createStudioForUser batch); the
-- content lives in lib/repos/templates.ts (starterTemplateRows) and is kept
-- in sync with these literals. Extras beyond a tier's gates stay dormant
-- rows — visible on upgrade, never deleted.
INSERT INTO template (id, organization_id, kind, name, body, meta, is_default)
SELECT lower(hex(randomblob(16))), id, 'contract', 'Wedding photography agreement',
'This agreement is between {{studio_name}} ("the Studio") and {{client_name}} ("the Client") for the wedding photography collection described as {{project_title}}.

Coverage. The Studio will photograph the wedding on {{event_date}} as outlined in the collection details shared with the Client.

Delivery. Edited, gallery-ready images are delivered through a private online gallery within six weeks of the wedding date.

Payment. The retainer reserves the date and is applied toward the total. The remaining balance is due one week before the wedding.

Cancellation. If the Client cancels, the retainer is non-refundable. The Studio will make reasonable efforts to rebook the date.

Creative license. The Studio retains the copyright in all images and may share selected images for portfolio use unless the Client requests otherwise in writing.

By signing below, both parties agree to these terms.', '{}', 1
FROM organization;

INSERT INTO template (id, organization_id, kind, name, body, meta, is_default)
SELECT lower(hex(randomblob(16))), id, 'contract', 'Portrait session agreement',
'This portrait session agreement is between {{studio_name}} ("the Studio") and {{client_name}} ("the Client").

Session. The portrait session takes place on {{event_date}} at the agreed location and time.

Delivery. The Client receives a private online gallery of fully edited images within two weeks of the session.

Usage. Personal printing and sharing are included. Commercial use of the images requires written permission from the Studio.

Payment. The session fee is due at booking and reserves the date.

By signing below, both parties agree to these terms.', '{}', 0
FROM organization;

INSERT INTO template (id, organization_id, kind, name, body, meta, is_default)
SELECT lower(hex(randomblob(16))), id, 'form', 'General intake',
'{"v": 1, "title": "Get in touch", "intro": "Tell us about your shoot — we usually reply within a day.", "thankYou": "Thank you — your inquiry is in! We''ll get back to you shortly.", "fields": [{"id": "f_name", "kind": "text", "label": "Name", "required": true, "half": true}, {"id": "f_email", "kind": "email", "label": "Email", "required": true, "half": true}, {"id": "f_phone", "kind": "phone", "label": "Phone", "required": false, "half": true}, {"id": "f_eventDate", "kind": "date", "label": "Event date", "required": false, "half": true}, {"id": "f_eventType", "kind": "select", "label": "What kind of shoot?", "required": false, "options": ["Wedding", "Engagement", "Family", "Portrait", "Event", "Commercial", "Other"]}, {"id": "f_message", "kind": "textarea", "label": "Tell us more", "required": false}]}', '{}', 1
FROM organization;

INSERT INTO template (id, organization_id, kind, name, body, meta, is_default)
SELECT lower(hex(randomblob(16))), id, 'email_snippet', 'Inquiry reply',
'<p>Hi {{client_name}},</p>
<p>thank you for reaching out — it would be great to hear more about {{project_title}}. I will come back to you within one business day with availability and collections.</p>
<p>Talk soon,<br>{{studio_name}}</p>',
'{"subject":"Thank you for reaching out to {{studio_name}}"}', 1
FROM organization;

INSERT INTO template (id, organization_id, kind, name, body, meta, is_default)
SELECT lower(hex(randomblob(16))), id, 'email_snippet', 'Booking — thank you',
'<p>Hi {{client_name}},</p>
<p>your session on {{event_date}} is confirmed and I am so looking forward to it! If anything changes before then, just reply to this email.</p>
<p>See you soon,<br>{{studio_name}}</p>',
'{"subject":"Your booking is confirmed — {{event_date}}"}', 0
FROM organization;

INSERT INTO template (id, organization_id, kind, name, body, meta, is_default)
SELECT lower(hex(randomblob(16))), id, 'email_snippet', 'Gallery delivery note',
'<p>Hi {{client_name}},</p>
<p>your gallery is ready! View and favorite your images here: {{gallery_link}}</p>
<p>The gallery stays open for 90 days — download your favorites before then.</p>
<p>Enjoy,<br>{{studio_name}}</p>',
'{"subject":"Your photos are ready 🎉"}', 0
FROM organization;

INSERT INTO template (id, organization_id, kind, name, body, meta, is_default)
SELECT lower(hex(randomblob(16))), id, 'invoice_preset', 'Standard terms',
'[]',
'{"terms":"Payment due within 14 days of the invoice date.","notes":"Thank you for your business!"}', 1
FROM organization;

INSERT INTO template (id, organization_id, kind, name, body, meta, is_default)
SELECT lower(hex(randomblob(16))), id, 'questionnaire', 'Client questionnaire',
'{"v":1,"title":"A few questions","intro":"Your answers help us plan the session perfectly.","thankYou":"Thank you — your answers are in!","fields":[
{"id":"f_name","kind":"text","label":"Your name","required":true,"half":true},
{"id":"f_email","kind":"email","label":"Email","required":true,"half":true},
{"id":"f_phone","kind":"phone","label":"Best phone for day-of","required":false,"half":true},
{"id":"f_date","kind":"date","label":"Session date (if set)","required":false,"half":true},
{"id":"f_venue","kind":"text","label":"Venue / location","required":false,"help":"Address or name of the place","half":true},
{"id":"f_arrival","kind":"text","label":"Who should we ask for on arrival?","required":false,"half":true},
{"id":"f_style","kind":"select","label":"Which photos matter most?","required":false,"options":["Candids + in-between moments","Formal groupings","Couple portraits","Detail shots","A mix of everything"]},
{"id":"f_must","kind":"textarea","label":"Any must-have shots?","required":false,"help":"Family groupings, heirlooms, pets — anything that simply cannot be missed"},
{"id":"f_notes","kind":"textarea","label":"Anything else we should know?","required":false}
]}', '{}', 1
FROM organization;
