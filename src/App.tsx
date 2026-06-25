import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Link2,
  Loader2,
  LogOut,
  UploadCloud,
  WandSparkles,
  X
} from "lucide-react";
import {
  applySelections,
  disconnectProvider,
  getAuthStatus,
  matchAnimeEntries,
  parseAnimeText
} from "./api";
import type {
  AuthStatus,
  MatchResult,
  NormalizedStatus,
  ProviderId,
  RankedCandidate,
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

const PROVIDERS: Array<{ id: ProviderId; label: string }> = [
  { id: "mal", label: "MyAnimeList" },
  { id: "anilist", label: "AniList" }
];

const SAMPLE = `Frieren Beyond Journey's End - watching ep 12
Cowboy Bebop completed 10/10
Steins;Gate (2011) finished score 9
Mob Psycho 100 III, done, 8/10
Dungeon Meshi plan to watch`;

function statusUsesProgress(status?: NormalizedStatus): boolean {
  return status !== undefined && status !== "planning";
}

function candidateOptionLabel(candidate: RankedCandidate): string {
  return [
    candidate.title,
    candidate.year ? String(candidate.year) : undefined,
    `${Math.round(candidate.matchScore * 100)}%`
  ]
    .filter(Boolean)
    .join(" · ");
}

export function App() {
  const [provider, setProvider] = useState<ProviderId>("mal");
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [text, setText] = useState(SAMPLE);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<string, number | undefined>>({});
  const [statuses, setStatuses] = useState<Record<string, NormalizedStatus | undefined>>({});
  const [scores, setScores] = useState<Record<string, number | undefined>>({});
  const [progress, setProgress] = useState<Record<string, number | undefined>>({});
  const [busy, setBusy] = useState<"parse" | "apply" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  const activeProvider = PROVIDERS.find((item) => item.id === provider)!;
  const connected = auth?.providers.find((item) => item.id === provider)?.connected ?? false;
  const selectedCount = useMemo(
    () => Object.values(selectedIds).filter((value) => value !== undefined).length,
    [selectedIds]
  );
  const lineCount = text.trim() ? text.trim().split(/\n+/).length : 0;

  useEffect(() => {
    void refreshAuth();
  }, []);

  async function refreshAuth() {
    try {
      setAuth(await getAuthStatus());
    } catch {
      setMessage("Start the API server, then refresh this page.");
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
      setScores(
        Object.fromEntries(matched.matches.map((match) => [match.entry.id, match.entry.score]))
      );
      setProgress(
        Object.fromEntries(
          matched.matches.map((match) => [match.entry.id, match.entry.progress])
        )
      );
      setMessage(`${matched.matches.length} entries ready to review.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That list could not be matched.");
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
        if (providerAnimeId === undefined) return [];

        const entryStatus = statuses[match.entry.id];
        return [{
          parsedId: match.entry.id,
          providerAnimeId,
          status: entryStatus,
          score: scores[match.entry.id],
          progress: statusUsesProgress(entryStatus) ? progress[match.entry.id] : undefined,
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
      setMessage(`${applied.results.length} entries sent to ${activeProvider.label}.`);
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

  function updateStatus(match: MatchResult, nextStatus: NormalizedStatus) {
    setStatuses((current) => ({ ...current, [match.entry.id]: nextStatus }));

    if (nextStatus === "completed") {
      const selected = match.candidates.find(
        (candidate) => candidate.providerId === selectedIds[match.entry.id]
      );
      if (selected?.episodes) {
        setProgress((current) => ({ ...current, [match.entry.id]: selected.episodes! }));
      }
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Animemory home">animemory</a>
        <div className="provider-switch" aria-label="Choose an anime list provider">
          {PROVIDERS.map((item) => (
            <button
              aria-pressed={provider === item.id}
              className="provider-button"
              key={item.id}
              onClick={() => setProvider(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="auth-action">
          {connected ? (
            <button className="quiet-button" type="button" onClick={disconnect}>
              <LogOut size={16} />
              Disconnect
            </button>
          ) : (
            <a className="connect-link" href={`/api/auth/${provider}/start`}>
              <Link2 size={16} />
              Connect
            </a>
          )}
        </div>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <h1 id="page-title">Unformatted list -&gt; Clean My Anime List Entries</h1>
        <p>{connected ? `${activeProvider.label} is connected.` : `Connect ${activeProvider.label} before saving.`}</p>
      </section>

      <section className="workspace" aria-label="Anime import workspace">
        <section className="panel input-panel" aria-labelledby="paste-title">
          <div className="panel-heading">
            <h2 id="paste-title">Paste</h2>
            <span>{lineCount} lines</span>
          </div>
          <textarea
            aria-label="Anime list text"
            className="list-input"
            onChange={(event) => setText(event.target.value)}
            placeholder="Paste one messy anime list here..."
            spellCheck={false}
            value={text}
          />
          <button
            className="primary-button"
            disabled={busy !== null || !text.trim()}
            onClick={parseAndMatch}
            type="button"
          >
            {busy === "parse" ? <Loader2 className="spin" size={18} /> : <WandSparkles size={18} />}
            Match list
          </button>
        </section>

        <section className="panel review-panel" aria-labelledby="review-title">
          <div className="panel-heading review-heading">
            <div>
              <h2 id="review-title">Review</h2>
              <span>{matches.length ? `${selectedCount}/${matches.length} selected` : "No matches yet"}</span>
            </div>
            <button
              className="save-button"
              disabled={busy !== null || !connected || selectedCount === 0}
              onClick={apply}
              type="button"
            >
              {busy === "apply" ? <Loader2 className="spin" size={18} /> : <UploadCloud size={18} />}
              Add selected
            </button>
          </div>

          {message ? (
            <div className="notice" role="status">
              <CircleAlert size={16} />
              <span>{message}</span>
            </div>
          ) : null}

          <div className="review-list">
            {matches.length === 0 ? (
              <div className="empty-state">Paste a list, then match it.</div>
            ) : (
              matches.map((match, index) => (
                <ReviewRow
                  index={index + 1}
                  key={match.entry.id}
                  match={match}
                  progress={progress[match.entry.id]}
                  result={results[match.entry.id]}
                  score={scores[match.entry.id]}
                  selectedId={selectedIds[match.entry.id]}
                  status={statuses[match.entry.id]}
                  onProgress={(value) =>
                    setProgress((current) => ({ ...current, [match.entry.id]: value }))
                  }
                  onScore={(value) =>
                    setScores((current) => ({ ...current, [match.entry.id]: value }))
                  }
                  onSelect={(providerAnimeId) =>
                    setSelectedIds((current) => ({ ...current, [match.entry.id]: providerAnimeId }))
                  }
                  onStatus={(nextStatus) => updateStatus(match, nextStatus)}
                />
              ))
            )}
          </div>
        </section>
      </section>

      <footer className="footer-links">
        <a href="https://tzhu.dev" rel="noopener noreferrer" target="_blank">tzhu.dev</a>
        <a href="https://ko-fi.com/fowlfarmer" rel="noopener noreferrer" target="_blank">Ko-fi</a>
      </footer>
    </main>
  );
}

function ReviewRow({
  index,
  match,
  selectedId,
  status,
  score,
  progress,
  result,
  onSelect,
  onStatus,
  onScore,
  onProgress
}: {
  index: number;
  match: MatchResult;
  selectedId?: number;
  status?: NormalizedStatus;
  score?: number;
  progress?: number;
  result?: string;
  onSelect: (providerAnimeId?: number) => void;
  onStatus: (status: NormalizedStatus) => void;
  onScore: (score?: number) => void;
  onProgress: (progress?: number) => void;
}) {
  const activeStatus = status ?? "planning";
  const selected = match.candidates.find((candidate) => candidate.providerId === selectedId);
  const showProgress = statusUsesProgress(activeStatus);
  const episodeTotal = selected?.episodes ?? undefined;

  return (
    <article className="review-row">
      <div className="row-number">{String(index).padStart(2, "0")}</div>
      <div className="cover">
        {selected?.image ? <img src={selected.image} alt="" /> : null}
      </div>

      <div className="title-cell">
        <p className="raw-title">{match.entry.raw}</p>
        <select
          aria-label={`Match for ${match.entry.title}`}
          className="field match-field"
          onChange={(event) =>
            onSelect(event.target.value ? Number(event.target.value) : undefined)
          }
          value={selectedId ?? ""}
        >
          <option value="">Skip this entry</option>
          {match.candidates.map((candidate) => (
            <option key={candidate.providerId} value={candidate.providerId}>
              {candidateOptionLabel(candidate)}
            </option>
          ))}
        </select>
      </div>

      <div className="control-grid">
        <select
          aria-label={`Status for ${match.entry.title}`}
          className="field"
          onChange={(event) => onStatus(event.target.value as NormalizedStatus)}
          value={activeStatus}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>

        <select
          aria-label={`Score for ${match.entry.title}`}
          className="field"
          onChange={(event) =>
            onScore(event.target.value ? Number(event.target.value) : undefined)
          }
          value={score ?? ""}
        >
          <option value="">No score</option>
          {Array.from({ length: 10 }, (_, scoreIndex) => scoreIndex + 1).map((value) => (
            <option key={value} value={value}>{value}/10</option>
          ))}
        </select>

        <label className="progress-control">
          <span>Ep</span>
          <input
            aria-label={`Progress for ${match.entry.title}`}
            className="field progress-field"
            disabled={!showProgress}
            inputMode="numeric"
            max={episodeTotal ?? undefined}
            min={0}
            onChange={(event) => {
              const raw = event.target.value.trim();
              onProgress(raw === "" ? undefined : Math.max(0, Number(raw)));
            }}
            placeholder="0"
            type="number"
            value={progress ?? ""}
          />
          {episodeTotal ? <span className="episode-total">/{episodeTotal}</span> : null}
        </label>
      </div>

      <div className="row-state">
        {result === "Saved" ? (
          <span className="save-state good"><CheckCircle2 size={16} />Saved</span>
        ) : result ? (
          <span className="save-state bad"><CircleAlert size={16} />Failed</span>
        ) : selectedId === undefined ? (
          <span className="save-state muted"><X size={16} />Skipped</span>
        ) : (
          <span className="save-state ready">Ready</span>
        )}
      </div>
    </article>
  );
}
