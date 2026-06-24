import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Link2,
  Loader2,
  LogOut,
  UploadCloud,
  WandSparkles
} from "lucide-react";
import {
  applySelections,
  disconnectProvider,
  getAuthStatus,
  matchAnimeEntries,
  parseAnimeText
} from "./api";
import type {
  AnimeCandidate,
  AuthStatus,
  MatchResult,
  NormalizedStatus,
  ParsedAnimeEntry,
  ProviderId,
  SaveSelection
} from "./types";

const STATUS_OPTIONS: Array<{ value: NormalizedStatus; label: string }> = [
  { value: "current", label: "Watching" },
  { value: "planning", label: "Plan to watch" },
  { value: "completed", label: "Completed" },
  { value: "paused", label: "On pause" },
  { value: "dropped", label: "Dropped" },
  { value: "repeating", label: "Rewatching" }
];

const PROVIDERS: Array<{ id: ProviderId; label: string; accent: string }> = [
  { id: "mal", label: "MyAnimeList", accent: "blue" },
  { id: "anilist", label: "AniList", accent: "violet" }
];

const SAMPLE = `Frieren Beyond Journey's End - watching ep 12
Cowboy Bebop completed 10/10
Steins;Gate (2011) finished score 9
Mob Psycho 100 III, done, 8.5/10
Dungeon Meshi plan to watch`;

export function App() {
  const [provider, setProvider] = useState<ProviderId>("mal");
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [text, setText] = useState(SAMPLE);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<string, number | undefined>>({});
  const [statuses, setStatuses] = useState<Record<string, NormalizedStatus | undefined>>({});
  const [busy, setBusy] = useState<"parse" | "apply" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  const connected = auth?.providers.find((item) => item.id === provider)?.connected ?? false;
  const selectedCount = useMemo(
    () => Object.values(selectedIds).filter(Boolean).length,
    [selectedIds]
  );
  const activeProvider = PROVIDERS.find((item) => item.id === provider)!;

  useEffect(() => {
    void refreshAuth();
  }, []);

  async function refreshAuth() {
    try {
      setAuth(await getAuthStatus());
    } catch {
      setMessage("The local API is not running yet.");
    }
  }

  async function parseAndMatch() {
    setBusy("parse");
    setMessage(null);
    setResults({});
    try {
      const parsed = await parseAnimeText(text);
      const matched = await matchAnimeEntries(provider, parsed.entries);
      setMatches(matched.matches);
      setSelectedIds(
        Object.fromEntries(
          matched.matches.map((match) => [match.entry.id, match.selected?.providerId])
        )
      );
      setStatuses(
        Object.fromEntries(
          matched.matches.map((match) => [match.entry.id, match.entry.status ?? "planning"])
        )
      );
      setMessage(`${matched.matches.length} matches found.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That list could not be matched yet.");
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    setBusy("apply");
    setMessage(null);
    try {
      const selections: SaveSelection[] = matches.flatMap((match) => {
        const providerAnimeId = selectedIds[match.entry.id];
        if (!providerAnimeId) return [];
        return [{
          parsedId: match.entry.id,
          providerAnimeId,
          status: statuses[match.entry.id],
          score: match.entry.score,
          progress: match.entry.progress,
          notes: match.entry.notes
        }];
      });

      const applied = await applySelections(provider, selections);
      setResults(
        Object.fromEntries(
          applied.results.map((result) => [
            result.parsedId,
            result.ok ? "Saved" : result.error ?? "Could not save"
          ])
        )
      );
      setMessage(`${applied.results.length} entries added.`);
      await refreshAuth();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Those entries could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    await disconnectProvider(provider);
    await refreshAuth();
    setMessage(`${activeProvider.label} disconnected.`);
  }

  return (
    <main className="page-shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="Animemory home">
          <span className="wordmark-spark">*</span>
          animemory
        </a>
        <div className="provider-tabs" role="tablist" aria-label="Choose an anime provider">
          {PROVIDERS.map((item) => (
            <button
              aria-selected={provider === item.id}
              className={provider === item.id ? `active ${item.accent}` : item.accent}
              key={item.id}
              onClick={() => setProvider(item.id)}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="account-action">
          {connected ? (
            <button className="text-button" type="button" onClick={disconnect}>
              <LogOut size={15} />
              Disconnect
            </button>
          ) : (
            <a className="connect-button" href={`/auth/${provider}/start`}>
              <Link2 size={16} />
              Connect {activeProvider.label}
            </a>
          )}
        </div>
      </header>

      <section className="hero-band" aria-labelledby="page-title">
        <div className="hero-copy">
          <h1 id="page-title">Unformatted list -&gt; Clean My Anime List Entries</h1>
          <div className="hero-status">
            <span className={connected ? "status-dot is-connected" : "status-dot"} />
            <span>{connected ? `${activeProvider.label} connected` : `Connect ${activeProvider.label} to add entries`}</span>
          </div>
        </div>
      </section>

      <section className="desk" aria-label="Anime import workspace">
        <section className="paste-sheet" aria-labelledby="paste-heading">
          <div className="section-topline">
            <div>
              <h2 id="paste-heading">Notes</h2>
            </div>
            <span className="paper-count">{text.trim() ? text.trim().split(/\n+/).length : 0}</span>
          </div>
          <textarea
            aria-label="Anime list text"
            onChange={(event) => setText(event.target.value)}
            placeholder="One anime per line..."
            spellCheck={false}
            value={text}
          />
          <div className="sheet-footer">
            <button
              className="magic-button"
              disabled={busy !== null || !text.trim()}
              onClick={parseAndMatch}
              type="button"
            >
              {busy === "parse" ? <Loader2 className="spin" size={18} /> : <WandSparkles size={18} />}
              Match my list
            </button>
          </div>
        </section>

        <section className="review-sheet" aria-labelledby="review-heading">
          <div className="section-topline review-topline">
            <div>
              <h2 id="review-heading">Matches</h2>
            </div>
            <button
              className="save-button"
              disabled={busy !== null || !connected || selectedCount === 0}
              onClick={apply}
              type="button"
            >
              {busy === "apply" ? <Loader2 className="spin" size={17} /> : <UploadCloud size={17} />}
              Add {selectedCount || ""} to my list
            </button>
          </div>

          {message ? (
            <div className="message-strip" role="status">
              <CircleAlert size={16} />
              {message}
            </div>
          ) : null}

          <div className="match-list">
            {matches.length === 0 ? (
              <div className="empty-review">
                <p>No matches yet.</p>
              </div>
            ) : (
              matches.map((match, index) => (
                <MatchCard
                  index={index + 1}
                  key={match.entry.id}
                  match={match}
                  result={results[match.entry.id]}
                  selectedId={selectedIds[match.entry.id]}
                  status={statuses[match.entry.id]}
                  onSelect={(candidate) =>
                    setSelectedIds((current) => ({
                      ...current,
                      [match.entry.id]: candidate?.providerId
                    }))
                  }
                  onStatus={(nextStatus) =>
                    setStatuses((current) => ({ ...current, [match.entry.id]: nextStatus }))
                  }
                />
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function MatchCard({
  index,
  match,
  selectedId,
  status,
  result,
  onSelect,
  onStatus
}: {
  index: number;
  match: MatchResult;
  selectedId?: number;
  status?: NormalizedStatus;
  result?: string;
  onSelect: (candidate?: AnimeCandidate) => void;
  onStatus: (status: NormalizedStatus) => void;
}) {
  const selected = match.candidates.find((candidate) => candidate.providerId === selectedId);

  return (
    <article className="match-card">
      <div className="entry-number">{String(index).padStart(2, "0")}</div>
      <div className="cover-art">
        {selected?.image ? <img src={selected.image} alt="" /> : <span className="cover-placeholder" />}
      </div>
      <div className="match-details">
        <p className="source-note">{match.entry.raw}</p>
        <label className="select-wrap">
          <span className="sr-only">Match for {match.entry.title}</span>
          <select
            aria-label={`Match for ${match.entry.title}`}
            onChange={(event) => {
              const nextId = Number(event.target.value);
              onSelect(match.candidates.find((candidate) => candidate.providerId === nextId));
            }}
            value={selectedId ?? ""}
          >
            <option value="">Keep this one aside</option>
            {match.candidates.map((candidate) => (
              <option key={candidate.providerId} value={candidate.providerId}>
                {candidate.title}{candidate.year ? ` (${candidate.year})` : ""}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" size={16} />
        </label>
        <div className="entry-meta">
          <span>{Math.round(match.confidence * 100)}% match</span>
          {selected?.episodes ? <span>{selected.episodes} eps</span> : null}
          {match.entry.score !== undefined ? <span>{match.entry.score}/10</span> : null}
          {match.entry.progress !== undefined ? <span>ep {match.entry.progress}</span> : null}
        </div>
      </div>
      <div className="entry-actions">
        <label className="status-select">
          <span className="sr-only">Status for {match.entry.title}</span>
          <select
            aria-label={`Status for ${match.entry.title}`}
            onChange={(event) => onStatus(event.target.value as NormalizedStatus)}
            value={status ?? "planning"}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" size={15} />
        </label>
        {result ? (
          <span className={result === "Saved" ? "result-badge good" : "result-badge bad"}>
            {result === "Saved" ? <CheckCircle2 size={15} /> : <CircleAlert size={15} />}
            {result}
          </span>
        ) : null}
      </div>
    </article>
  );
}
