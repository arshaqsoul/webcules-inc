import Link from "next/link";
import { ArrowIcon } from "../components/icons";
import { FeaturedCarousel } from "../components/featured-carousel";
import { LabMark } from "../components/lab-mark";
import { PersonalPaperPick } from "../components/personal-paper-pick";
import { SiteHeader } from "../components/site-header";
import { SourceLink } from "../components/source-link";
import { TopicStrip } from "../components/topic-strip";
import { YearExplorer, type MonthEntry } from "../components/year-explorer";
import { monthDefinitions } from "../lib/months";
import { formatMonthYear, getHomepageData, getPaperCatalog } from "../lib/papers";
import { paperHref } from "../lib/paper-url";
import { getSectionPapers } from "../lib/topics";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    title: "The Year in AI Papers: Essential Research from 2025–2026",
    description: "Clear summaries of important AI papers from 2025–2026, organized by topic, research lab, citations, code, and publication date.",
    url: "/",
  },
};

const featuredLabs = [
  { name: "OpenAI", slug: "openai" },
  { name: "Anthropic", slug: "anthropic" },
  { name: "Moonshot AI", slug: "moonshot-kimi" },
  { name: "DeepSeek", slug: "deepseek" },
  { name: "MiniMax", slug: "minimax" },
  { name: "Z.ai / GLM", slug: "zai-glm" },
] as const;

const homepageTopics = [
  { slug: "reasoning", label: "Reasoning" },
  { slug: "agents", label: "Agents" },
  { slug: "multimodal", label: "Multimodal" },
  { slug: "video-spatial", label: "Video" },
  { slug: "systems", label: "Systems" },
  { slug: "robotics", label: "Robotics" },
] as const;

const pipelineSteps = [
  {
    title: "Frozen research corpus",
    subtitle: "Paper records, abstracts, and citation snapshots",
    input: "arXiv + Hugging Face Daily Papers",
    output: "Curated paper catalog",
    engine: "Snapshot",
  },
  {
    title: "GLM Flash summaries",
    subtitle: "One fresh markdown summary per paper",
    input: "Title + abstract",
    output: "650–1,150 character summary",
    engine: "GLM Flash",
  },
  {
    title: "Jev topic assignment",
    subtitle: "Typed classification with calibrated confidence",
    input: "Title + summary",
    output: "Primary + secondary collection",
    engine: "Jev via Cloudflare AI Gateway",
  },
] as const;

export default async function HomePage() {
  const [{ trending, mostCited, monthCounts }, { papers }] = await Promise.all([
    getHomepageData(),
    getPaperCatalog(),
  ]);
  const collectionPaperCount = papers.length;
  const paperCountLabel = collectionPaperCount.toLocaleString("en");
  const monthEntries: MonthEntry[] = [...monthDefinitions].reverse().map((month) => ({
    key: month.key,
    month: month.month,
    year: month.year,
    count: monthCounts[month.key] ?? 0,
  }));
  // Keep the homepage index compact; the full eight-area taxonomy lives on
  // /topics. Short labels prevent the navigation from wrapping.
  const featuredTopics = homepageTopics.map((topic) => ({
    key: topic.slug,
    label: topic.label,
    count: getSectionPapers(topic.slug, papers).length,
  }));
  if (trending.length === 0) return null;

  return (
    <main>
      <SiteHeader />

      <section className="hero page-shell" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title" className="display-serif text-balance">
            <span>The year in AI</span>{" "}
            <span>papers</span>
          </h1>
          <p>{paperCountLabel} papers mapping AI research from 2025–2026.</p>
        </div>
      </section>

      <section className="lab-index page-shell" aria-labelledby="lab-index-title">
        <div className="lab-index-heading">
          <h2 id="lab-index-title" className="mono-label">Explore by research lab</h2>
          <Link href="/labs" className="signal-link section-action focus-ring">
            View all labs <ArrowIcon />
          </Link>
        </div>
        <div className="lab-list">
          {featuredLabs.map((lab) => (
            <Link key={lab.slug} href={`/labs/${lab.slug}`} className="focus-ring">
              <LabMark lab={lab.name} />
            </Link>
          ))}
        </div>
      </section>

      <section className="atlas-grid page-shell rule-top" id="collections">
        <aside className="topic-column">
          <h2 className="mono-label">Browse by topics</h2>
          <TopicStrip topics={featuredTopics.map((topic) => ({ ...topic, slug: topic.key }))} />
          <Link className="signal-link row-link section-action focus-ring" href="/topics">
            View all topics <ArrowIcon />
          </Link>
        </aside>

        <section className="featured-story">
          <div className="story-copy">
            <p className="mono-label"><span>01</span> Trending this year</p>
            <h2 className="display-serif text-balance">The papers that moved AI forward</h2>
            <p className="story-description text-pretty">
              Selected for citation impact, official-code adoption, recency, and field-wide significance.
            </p>
            <Link className="signal-link row-link section-action focus-ring" href="/most-trending-papers">
              View all top papers <ArrowIcon />
            </Link>
          </div>
          <FeaturedCarousel papers={trending} />
        </section>

        <aside className="popular-column">
          <div className="column-heading">
            <h2 className="mono-label">Most cited</h2>
            <span className="mono-label">Citations</span>
          </div>
          <ol>
            {mostCited.slice(0, 3).map((paper, index) => (
              <li key={paper.id}>
                <span className="topic-index">{String(index + 1).padStart(2, "0")}</span>
                <Link href={paperHref(paper)} className="focus-ring">
                  <strong>{paper.title}</strong>
                  <small>{formatMonthYear(paper.publishedAt)}</small>
                </Link>
                <span className="upvote tabular-nums">{paper.citations}</span>
              </li>
            ))}
          </ol>
          <Link className="signal-link row-link focus-ring" href="/most-cited-papers">
            View top 100 <ArrowIcon />
          </Link>
        </aside>
      </section>

      <YearExplorer months={monthEntries} totalCount={collectionPaperCount} totalLabel={paperCountLabel} />

      <PersonalPaperPick papers={[...trending, ...mostCited]} />

      <section className="benchmark-costs page-shell rule-top" aria-labelledby="pipeline-title">
        <div className="benchmark-cost-intro">
          <p className="mono-label">The content pipeline</p>
          <h2 id="pipeline-title" className="display-serif text-balance">How every entry is produced.</h2>
          <p className="text-pretty">Each summary and topic assignment on this site comes from a reproducible three-stage run over the frozen paper corpus.</p>
        </div>
        <div className="benchmark-cost-results">
          {pipelineSteps.map((step, index) => (
            <article key={step.title} className="benchmark-cost-row">
              <span className="mono-label">{String(index + 1).padStart(2, "0")}</span>
              <div className="benchmark-model">
                <h3 className="display-serif">{step.title}</h3>
                <p>{step.subtitle}</p>
              </div>
              <dl>
                <div>
                  <dt>Input</dt>
                  <dd>{step.input}</dd>
                </div>
                <div>
                  <dt>Output</dt>
                  <dd>{step.output}</dd>
                </div>
                <div>
                  <dt>Engine</dt>
                  <dd>{step.engine}</dd>
                </div>
              </dl>
            </article>
          ))}
          <p className="benchmark-cost-note text-pretty">Summaries are written fresh by GLM Flash from each paper's arXiv abstract. Topic assignments come from Jev, TypeSafe AI's System One model, through a Cloudflare AI Gateway, with a GLM Flash fallback when the gateway is not configured. Corpus and publication metadata derive from the open-source 1kpapers corpus (MIT).</p>
        </div>
      </section>

      <section className="about-section page-shell" id="about" aria-labelledby="about-title">
        <div className="about-intro">
          <p className="mono-label">About &amp; methodology</p>
          <h2 id="about-title" className="display-serif text-balance">
            How a year of AI research becomes a navigable atlas.
          </h2>
          <p className="about-deck text-pretty">
            This rebuild follows the same three-stage recipe as the original project: freeze a corpus, produce one summary per paper, and classify every paper into an editorial atlas — with GLM Flash doing the writing and Jev doing the classifying.
          </p>
        </div>

        <div className="method-list">
          <article className="method-step">
            <span className="mono-label">01</span>
            <div>
              <h3 className="display-serif">Start from an open corpus</h3>
              <p className="text-pretty">
                Paper records — titles, authors, abstracts, version-pinned arXiv links, Hugging Face upvotes, GitHub stars, and citation snapshots — come from the MIT-licensed 1kpapers corpus, covering August 4, 2025 through August 4, 2026. Nothing here re-scrapes the original site: the corpus is the shared, factual starting point.
              </p>
            </div>
          </article>

          <article className="method-step">
            <span className="mono-label">02</span>
            <div>
              <h3 className="display-serif">Summarize with GLM Flash</h3>
              <p className="text-pretty">
                Every summary on this site is written fresh from the paper's own abstract under a fixed contract — an opening paragraph, two to four bolded bullet facts, and no numbers that the abstract does not contain. No text is copied from anywhere else.
              </p>
            </div>
          </article>

          <article className="method-step">
            <span className="mono-label">03</span>
            <div>
              <h3 className="display-serif">Classify with Jev</h3>
              <p className="text-pretty">
                Jev — TypeSafe AI's System One model, called through a Cloudflare AI Gateway — receives each title and summary as state and returns a typed decision: one of 24 editorial collections as the primary topic, an optional secondary topic, and a confidence score. GLM Flash fills in when the gateway is unavailable.
              </p>
            </div>
          </article>

          <article className="method-step">
            <span className="mono-label">04</span>
            <div>
              <h3 className="display-serif">Assemble the atlas</h3>
              <p className="text-pretty">
                A build script merges the corpus with the generated content into the same static JSON layout the original site served — catalog, rankings, per-paper summaries, and a search index — and the Next.js app renders it as a fully static site.
              </p>
            </div>
          </article>

          <p className="method-note text-pretty">
            This is a popularity-weighted field guide, not an exhaustive history of AI research or a factual-quality ranking. Summaries are machine-generated and should be verified against the linked arXiv originals. Corpus and site structure derive from the open-source 1kpapers project (MIT); thank you to arXiv for use of its open access interoperability.
          </p>
        </div>
      </section>

      <footer className="site-footer page-shell">
        <SourceLink />
        <span className="footer-window"><b>Aug 2025 to Aug 2026</b><small>Last 12 months</small></span>
        <a href="#hero-title">Back to top ↑</a>
      </footer>
    </main>
  );
}
import type { Metadata } from "next";
