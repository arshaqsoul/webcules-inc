/* Integrations & API tokens — how outside tools (starting with the
 * Lightroom Classic publish plugin) authenticate against your Snap studio.
 * Facts from components/integrations-panel.tsx, lib/integrations/tokens.ts,
 * lib/integrations/auth.ts and app/dashboard/settings/integrations/page.tsx
 * (WEB-186, Integrations 1/6). ZIP import facts from lib/zip-import.ts and
 * components/project-files.tsx (WEB-184, Integrations 3/6). Drive import
 * facts from lib/drive-import.ts and components/project-files.tsx
 * (WEB-183, Integrations 4/6). */
import { H2, H3, Note, Callout, Steps, Related } from "@/lib/docs/primitives";

export default function Integrations() {
  return (
    <>
      <p>
        An integration connects a tool outside Snap — the Lightroom Classic
        publish plugin is the first — to your studio, so it can do things like
        publish finished photos straight into a client gallery. Instead of your
        Snap password, the tool authenticates with an{" "}
        <strong>integration token</strong>: a long, single-purpose key you
        create, scope down to exactly what the tool needs, and can cut off at
        any time.
      </p>

      <H2>What a token is — and isn&rsquo;t</H2>
      <p>
        A token looks like <code>snapit_</code> followed by a long random
        string. Three things make tokens safer than sharing a login:
      </p>
      <ul>
        <li>
          <strong>It only does what you picked.</strong> Each token carries only
          the permissions (scopes) you selected when you created it — a token
          that can view galleries cannot upload anything, and no token can touch
          your studio&rsquo;s settings, billing, or team.
        </li>
        <li>
          <strong>Snap never stores the token itself.</strong> Only an
          irreversible cryptographic hash of it is kept — which is why the full
          token is shown to you <em>exactly once</em>, at creation. If you lose
          it, nobody can show it to you again; revoke it and make a new one.
        </li>
        <li>
          <strong>It can be revoked instantly.</strong> Revoking stops the tool
          from working immediately, without touching any other token or your own
          sign-in.
        </li>
      </ul>

      <H2>Create a token</H2>
      <p>
        Tokens live in{" "}
        <a href="/dashboard/settings/integrations">Settings → Integrations</a>,
        which only studio admins can open — the same bar as the other settings
        sections.
      </p>
      <Steps
        items={[
          <>
            Open <strong>Settings → Integrations</strong> and enter a{" "}
            <strong>name</strong> that says what the token is for — say,
            &ldquo;Lightroom on the studio iMac&rdquo;.
          </>,
          <>
            <strong>Pick the permissions</strong> the tool needs (below) — at
            least one. When in doubt, start with the narrowest.
          </>,
          <>
            Click <strong>Create token</strong>. Snap shows the full{" "}
            <code>snapit_…</code> key once, with a copy button —{" "}
            <strong>copy it into the tool now</strong> and click done.
          </>,
        ]}
      />
      <Callout tone="warn" title="Shown once, stored nowhere">
        Close the reveal without copying and the token is unrecoverable — Snap
        holds only a hash. That&rsquo;s deliberate: a hash can&rsquo;t leak.
        Just revoke the token and create a fresh one.
      </Callout>

      <H2>The permissions</H2>
      <p>
        Every token&rsquo;s scopes are listed next to it in Settings, so you can
        always see what a tool may do:
      </p>
      <H3>View galleries and collections</H3>
      <p>
        <code>galleries:read</code> — see the studio&rsquo;s galleries and
        what&rsquo;s in them. Read-only.
      </p>
      <H3>Create galleries and collections</H3>
      <p>
        <code>galleries:write</code> — create new galleries. The Lightroom
        plugin uses this when it auto-creates the gallery for a new publish
        collection; leave it off if you want to create galleries yourself.
      </p>
      <H3>View photos and metadata</H3>
      <p>
        <code>assets:read</code> — see photo files and their metadata.
        Read-only.
      </p>
      <H3>Upload and publish photos</H3>
      <p>
        <code>assets:write</code> — add photos to galleries and publish them.
        This is the one the Lightroom publish plugin needs, usually together
        with the two read scopes.
      </p>
      <Note>
        New integrations may introduce new scopes over time; existing tokens
        keep working unchanged, because permissions are matched by name.
      </Note>

      <H2>Manage and revoke</H2>
      <p>
        The Integrations page lists every token with its name, a short prefix of
        the key (so you can match a token you find in a tool to its row), its
        scopes, when it was created, and — after the tool first uses it — when
        it was <strong>last used</strong>. A token that says &ldquo;Never&rdquo;
        months after you made it is a token nothing is using.
      </p>
      <p>
        <strong>Revoke</strong> asks for confirmation, then kills the token
        immediately: anything still authenticating with it stops working the
        same moment. Revoked tokens stay in the list as history. To rotate a
        token into a fresh one, create the new token first, move the tool over,
        then revoke the old — no downtime.
      </p>

      <H2>Publishing from Lightroom Classic</H2>
      <p>
        The <strong>Snap Publish</strong> plugin puts a Snap service in
        Lightroom Classic&rsquo;s Publish Services panel. Each publish
        collection maps to the Snap gallery of the same name — the gallery is
        created on first publish if it doesn&rsquo;t exist — and pressing{" "}
        <strong>Publish</strong> sends the finished photos straight into it.
        Edit a published photo and Lightroom marks it <strong>Modified</strong>;
        publish again and the gallery gets the new version, not a duplicate.
        Remove a photo from the collection and it leaves the gallery too —
        unless it&rsquo;s already live in a client link, in which case Snap asks
        you to decide in the studio first.
      </p>
      <Steps
        items={[
          <>
            In Snap, create an integration token named for your Lightroom
            computer with <em>View galleries</em> and{" "}
            <em>Upload and publish photos</em> (add <em>Create galleries</em> to
            let new publish collections create their gallery).
          </>,
          <>
            Download the Snap Publish plugin from{" "}
            <strong>Settings → Integrations</strong>, install it in Lightroom
            Classic under <em>File → Plug-in Manager → Add</em>, paste your
            studio address and the token, and click <em>Test Connection</em>.
          </>,
          <>
            In the Library&rsquo;s Publish Services panel, set up the Snap
            service and create a publish collection named after the gallery it
            should feed. Drag photos in and hit <em>Publish</em>.
          </>,
        ]}
      />
      <Note>
        Sharing a gallery with a client still happens in Snap — publishing from
        Lightroom puts photos in the gallery; the client link, welcome page and
        download rules are yours to switch on when it&rsquo;s ready.
      </Note>

      <H2>Importing a ZIP of photos</H2>
      <p>
        Drop a <code>.zip</code> onto a project&rsquo;s <strong>Files</strong>{" "}
        tab (or pick one with the <strong>Upload</strong> button) and Snap
        unpacks it <strong>in your browser</strong> before anything is uploaded.
        The archive itself never leaves your computer — only the photos inside
        it do, one by one, through the same upload queue as drag-and-dropped
        files with the same duplicate checks.
      </p>
      <p>
        <strong>Folders come along.</strong> A single folder wrapping the whole
        archive (&ldquo;Smith Wedding/…&rdquo;) is ignored; the folders inside
        map to the project folders in your Files tab. Anything nested deeper
        than that lands in its top-level folder, and files sitting loose at the
        top of the archive stay unfiled. On a client upload page, everything
        arrives unfiled.
      </p>
      <ul>
        <li>
          OS clutter like <code>.DS_Store</code> and <code>__MACOSX</code>{" "}
          entries is skipped.
        </li>
        <li>
          File types Snap doesn&rsquo;t accept are skipped, and you&rsquo;re
          told how many.
        </li>
        <li>
          Guard rails: at most 5,000 entries, 2&nbsp;GB per file and 8&nbsp;GB
          total once expanded; archives that break a limit — or expand
          implausibly far beyond their zipped size — are refused before a single
          byte is uploaded.
        </li>
        <li>
          Standard zips only: archives in the older ZIP64 format can&rsquo;t be
          read — re-export them as a regular zip.
        </li>
      </ul>

      <H2>Importing from Google Drive</H2>
      <p>
        The <strong>Drive</strong> button on a project&rsquo;s{" "}
        <strong>Files</strong> tab opens Google&rsquo;s own file picker over
        your Drive — browse it exactly like you would in Google&rsquo;s apps,
        tick the photos, videos and RAWs you want, and press{" "}
        <strong>Select</strong>. Your browser downloads each picked file and
        feeds it into the same upload queue as drag-and-dropped files, with
        the same duplicate checks.
      </p>
      <p>
        <strong>Snap only ever sees what you picked.</strong> The consent
        screen asks for per-file access — the narrowest Google offers — so
        nothing else in your Drive is visible to Snap, and your files go
        straight from Google to your browser to Snap. Google Docs, Sheets and
        folders in a selection are left behind (as are file types Snap
        doesn&rsquo;t accept), and you&rsquo;re told how many. The same
        5&nbsp;GB-per-file limit as uploads applies, and up to 500 files per
        import.
      </p>
      <Note>
        The Drive button appears only when your Snap has been connected to a
        Google app for imports — if you don&rsquo;t see it, it hasn&rsquo;t
        been switched on for your environment.
      </Note>

      <H2>Client upload links</H2>
      <p>
        On a project&rsquo;s <strong>Client gallery</strong> tab, the{" "}
        <strong>Client uploads</strong> card mints a link you can text to
        wedding guests or hand to a client: anyone holding it can add photos
        and videos from their phone, no account needed — perfect for the
        &ldquo;everyone&rsquo;s phone pictures from the wedding&rdquo; pile
        no platform except the big two ever offered.
      </p>
      <p>
        <strong>Everything lands in quarantine.</strong> Guest uploads go
        straight into your project but are invisible to every client link
        until you approve them in the same card — approve (optionally
        publishing straight into a chosen client gallery) or reject, one at
        a time or all at once. Rejected uploads follow the same retention
        clock as your own rejections.
      </p>
      <ul>
        <li>
          The link itself is the key: it works for anyone who has it, so
          treat it like a gallery link — close it when the window is over,
          set an expiry or a file cap when you mint it.
        </li>
        <li>
          Guests can upload up to 1&nbsp;GB per file (phone videos welcome)
          and at most 500 files per link; your plan&rsquo;s storage and type
          rules still apply.
        </li>
        <li>
          You&rsquo;re notified as uploads arrive — an inbox item per file,
          plus at most one email per link per hour pointing at the review
          queue.
        </li>
        <li>
          Uploads arrive unfiled, exactly like a client upload page from a
          ZIP import — file them into folders once approved.
        </li>
      </ul>

      <Related slugs={["security", "gallery-delivery"]} />
    </>
  );
}
