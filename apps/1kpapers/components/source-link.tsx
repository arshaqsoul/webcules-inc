import { SOURCE_REPO_URL } from "../lib/external-links";

export function SourceLink() {
  return (
    <a className="footer-together-link focus-ring" href={SOURCE_REPO_URL} target="_blank" rel="noreferrer">
      <span className="footer-source-mark" aria-hidden="true">1k</span>
      <span>/ source &amp; process</span>
    </a>
  );
}
