-- WEB-248: forms engine — custom answers on leads + questionnaire responses.
ALTER TABLE lead ADD COLUMN custom_fields TEXT;

CREATE TABLE form_response (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  /** JSON: { answers: {fieldId: string|boolean}, files: {fieldId: {key,name,bytes}} } */
  answers TEXT,
  client_email TEXT,
  access_token_hash TEXT,
  token_enc TEXT,
  submitted_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX form_response_org_project_idx ON form_response(organization_id, project_id);
