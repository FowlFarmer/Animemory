import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Link2,
  Loader2,
  LogOut,
  Play,
  Send,
  UploadCloud,
  WandSparkles,
  X
} from "lucide-react";
import {
  applySelections,
  disconnectProvider,
  getAuthStatus,
  getExistingListEntries,
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
    candidate.matchedTitle,
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
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});
  const [existingEntries, setExistingEntries] = useState<Record<number, boolean>>({});
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [rapidOpen, setRapidOpen] = useState(false);
  const [rapidIndex, setRapidIndex] = useState(0);
  const [rapidCandidateId, setRapidCandidateId] = useState<number | undefined>();
  const [rapidScore, setRapidScore] = useState<number | undefined>();
  const [rapidApplying, setRapidApplying] = useState(false);

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
      const existing = await listStatusForMatches(matched.matches);

      setMatches(matched.matches);
      setExistingEntries(existing);
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
      setRapidOpen(false);
      setRapidIndex(0);
      setRapidCandidateId(undefined);
      setRapidScore(undefined);
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
        const selection = selectionForMatch(match);
        return selection ? [selection] : [];
      });

      const applied = await applySelections(provider, selections, overwriteExisting);
      setResults(
        Object.fromEntries(
          applied.results.map((result) => [
            result.parsedId,
            result.skipped ? "Skipped" : result.ok ? "Saved" : result.error ?? "Could not save"
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

  async function applyOne(match: MatchResult) {
    const selection = selectionForMatch(match);
    if (!selection) return;

    setRowBusy(match.entry.id);
    setMessage(null);

    try {
      const applied = await applySelections(provider, [selection], overwriteExisting);
      const result = applied.results[0];
      setResults((current) => ({
        ...current,
        [match.entry.id]: result?.skipped
          ? "Skipped"
          : result?.ok
            ? "Saved"
            : result?.error ?? "Could not save"
      }));
      await refreshAuth();
    } catch (error) {
      setResults((current) => ({
        ...current,
        [match.entry.id]: error instanceof Error ? error.message : "Could not save"
      }));
    } finally {
      setRowBusy(null);
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

  function setAllStatuses(nextStatus: NormalizedStatus) {
    setStatuses(
      Object.fromEntries(matches.map((match) => [match.entry.id, nextStatus]))
    );

    if (nextStatus === "completed") {
      setProgress((current) => ({
        ...current,
        ...Object.fromEntries(
          matches.map((match) => {
            const selected = match.candidates.find(
              (candidate) => candidate.providerId === selectedIds[match.entry.id]
            );
            return [match.entry.id, selected?.episodes ?? current[match.entry.id]];
          })
        )
      }));
    }
  }

  function selectionForMatch(match: MatchResult): SaveSelection | undefined {
    const providerAnimeId = selectedIds[match.entry.id];
    if (providerAnimeId === undefined) return undefined;

    const entryStatus = statuses[match.entry.id];
    return {
      parsedId: match.entry.id,
      providerAnimeId,
      status: entryStatus,
      score: scores[match.entry.id],
      progress: statusUsesProgress(entryStatus) ? progress[match.entry.id] : undefined,
      notes: match.entry.notes
    };
  }

  async function listStatusForMatches(matches: MatchResult[]): Promise<Record<number, boolean>> {
    const providerAnimeIds = Array.from(
      new Set(matches.flatMap((match) => match.candidates.map((candidate) => candidate.providerId)))
    );
    if (providerAnimeIds.length === 0) return {};

    try {
      const existing = await getExistingListEntries(provider, providerAnimeIds);
      return Object.fromEntries(existing.entries.map((entry) => [entry.providerAnimeId, true]));
    } catch {
      return {};
    }
  }

  function startRapidMode() {
    setRapidIndex(firstPendingIndex(results, matches));
    setRapidCandidateId(undefined);
    setRapidScore(undefined);
    setRapidOpen(true);
  }

  function closeRapidMode() {
    setRapidOpen(false);
    setRapidApplying(false);
    setRapidCandidateId(undefined);
    setRapidScore(undefined);
  }

  function advanceRapidMode(fromIndex: number) {
    const nextIndex = nextPendingIndex(results, matches, fromIndex + 1);
    setRapidCandidateId(undefined);
    setRapidScore(undefined);
    setRapidIndex(nextIndex);
  }

  async function maybeApplyRapid(match: MatchResult, candidateId?: number, score?: number) {
    if (rapidApplying || candidateId === undefined || score === undefined) return;

    const candidate = match.candidates.find((item) => item.providerId === candidateId);
    if (!candidate) return;

    setRapidApplying(true);
    setSelectedIds((current) => ({ ...current, [match.entry.id]: candidateId }));
    setStatuses((current) => ({ ...current, [match.entry.id]: "completed" }));
    setScores((current) => ({ ...current, [match.entry.id]: score }));
    setProgress((current) => ({ ...current, [match.entry.id]: candidate.episodes ?? undefined }));

    try {
      const applied = await applySelections(provider, [{
        parsedId: match.entry.id,
        providerAnimeId: candidateId,
        status: "completed",
        score,
        progress: candidate.episodes ?? undefined,
        notes: match.entry.notes
      }], overwriteExisting);
      const result = applied.results[0];
      setResults((current) => ({
        ...current,
        [match.entry.id]: result?.skipped
          ? "Skipped"
          : result?.ok
            ? "Saved"
            : result?.error ?? "Could not save"
      }));

      if (result?.ok) {
        advanceRapidMode(rapidIndex);
      }
    } catch (error) {
      setResults((current) => ({
        ...current,
        [match.entry.id]: error instanceof Error ? error.message : "Could not save"
      }));
    } finally {
      setRapidApplying(false);
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
              onClick={() => {
                setProvider(item.id);
                setMatches([]);
                setResults({});
                setExistingEntries({});
              }}
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
            <div className="review-actions">
              <select
                aria-label="Set all statuses"
                className="field bulk-status-field"
                disabled={matches.length === 0}
                onChange={(event) => {
                  if (!event.target.value) return;
                  setAllStatuses(event.target.value as NormalizedStatus);
                  event.target.value = "";
                }}
                value=""
              >
                <option value="">Set all...</option>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <label className="override-toggle">
                <input
                  checked={overwriteExisting}
                  onChange={(event) => setOverwriteExisting(event.target.checked)}
                  type="checkbox"
                />
                <span />
                Update existing
              </label>
              <button
                className="rapid-button"
                disabled={busy !== null || matches.length === 0}
                onClick={startRapidMode}
                type="button"
              >
                <Play size={17} />
                Rapid fire
              </button>
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
                  rowBusy={rowBusy === match.entry.id}
                  score={scores[match.entry.id]}
                  selectedId={selectedIds[match.entry.id]}
                  status={statuses[match.entry.id]}
                  existing={Boolean(
                    selectedIds[match.entry.id] !== undefined &&
                      existingEntries[selectedIds[match.entry.id]!]
                  )}
                  onApply={() => void applyOne(match)}
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

      {rapidOpen ? (
        <RapidFireMode
          applying={rapidApplying}
          candidateId={rapidCandidateId}
          connected={connected}
          index={rapidIndex}
          match={matches[rapidIndex]}
          matches={matches}
          results={results}
          score={rapidScore}
          onCandidate={(candidateId) => {
            setRapidCandidateId(candidateId);
            void maybeApplyRapid(matches[rapidIndex], candidateId, rapidScore);
          }}
          onClose={closeRapidMode}
          onScore={(score) => {
            setRapidScore(score);
            void maybeApplyRapid(matches[rapidIndex], rapidCandidateId, score);
          }}
        />
      ) : null}
    </main>
  );
}

function firstPendingIndex(results: Record<string, string>, matches: MatchResult[]): number {
  return nextPendingIndex(results, matches, 0);
}

function nextPendingIndex(
  results: Record<string, string>,
  matches: MatchResult[],
  startIndex: number
): number {
  const next = matches.findIndex((match, index) => index >= startIndex && results[match.entry.id] !== "Saved");
  return next === -1 ? matches.length : next;
}

function RapidFireMode({
  applying,
  candidateId,
  connected,
  index,
  match,
  matches,
  results,
  score,
  onCandidate,
  onClose,
  onScore
}: {
  applying: boolean;
  candidateId?: number;
  connected: boolean;
  index: number;
  match?: MatchResult;
  matches: MatchResult[];
  results: Record<string, string>;
  score?: number;
  onCandidate: (candidateId: number) => void;
  onClose: () => void;
  onScore: (score: number) => void;
}) {
  const savedCount = matches.filter((item) => results[item.entry.id] === "Saved").length;
  const selectedCandidate = match?.candidates.find((candidate) => candidate.providerId === candidateId);

  return (
    <section className="rapid-overlay" aria-label="Rapid fire mode">
      <button className="rapid-close" type="button" onClick={onClose} aria-label="Close rapid fire mode">
        <X size={24} />
      </button>

      {match ? (
        <div className="rapid-stage">
          <div className="rapid-topline">
            <span>{index + 1} / {matches.length}</span>
            <span>{savedCount} saved</span>
          </div>

          <div className="rapid-entry">
            <div className="rapid-cover">
              {selectedCandidate?.image ? <img src={selectedCandidate.image} alt="" /> : null}
            </div>
            <div>
              <p>Now rating</p>
              <h2>{match.entry.raw}</h2>
            </div>
          </div>

          <div className="rapid-grid">
            <div className="rapid-match-panel" aria-label="Choose the matching anime">
              {match.candidates.map((candidate) => (
                <button
                  className={candidate.providerId === candidateId ? "rapid-candidate is-selected" : "rapid-candidate"}
                  disabled={applying || !connected}
                  key={candidate.providerId}
                  onClick={() => onCandidate(candidate.providerId)}
                  type="button"
                >
                  <span>{candidate.title}</span>
                  <small>{[
                    candidate.year,
                    candidate.episodes ? `${candidate.episodes} eps` : undefined,
                    `${Math.round(candidate.matchScore * 100)}%`
                  ].filter(Boolean).join(" · ")}</small>
                </button>
              ))}
            </div>

            <div className="rapid-score-panel" aria-label="Choose completed rating">
              {Array.from({ length: 10 }, (_, scoreIndex) => scoreIndex + 1).map((value) => (
                <button
                  className={value === score ? "rapid-score is-selected" : "rapid-score"}
                  disabled={applying || !connected}
                  key={value}
                  onClick={() => onScore(value)}
                  type="button"
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div className="rapid-status" role="status">
            {applying ? "Saving..." : connected ? "Pick a match and a score." : "Connect your provider before saving."}
          </div>
        </div>
      ) : (
        <div className="rapid-done">
          <h2>All done.</h2>
          <p>{savedCount} entries saved.</p>
          <button className="primary-button" type="button" onClick={onClose}>Back to review</button>
        </div>
      )}
    </section>
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
  rowBusy,
  existing,
  onApply,
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
  rowBusy: boolean;
  existing: boolean;
  onApply: () => void;
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
        <p className="source-title">{match.entry.raw}</p>
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
        {existing && result !== "Saved" && result !== "Skipped" ? (
          <span className="existing-pill">On list</span>
        ) : null}
        <button
          aria-label={`Save ${match.entry.title}`}
          className="row-send-button"
          disabled={rowBusy || selectedId === undefined}
          onClick={onApply}
          type="button"
        >
          {rowBusy ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
        </button>
        <ResultBadge result={result} selectedId={selectedId} />
      </div>
    </article>
  );
}

function ResultBadge({ result, selectedId }: { result?: string; selectedId?: number }) {
  if (result === "Saved") {
    return <span className="save-state good"><CheckCircle2 size={16} />Saved</span>;
  }
  if (result === "Skipped") {
    return <span className="save-state muted"><X size={16} />Exists</span>;
  }
  if (result) {
    return <span className="save-state bad"><CircleAlert size={16} />Failed</span>;
  }
  if (selectedId === undefined) {
    return <span className="save-state muted"><X size={16} />Skip</span>;
  }
  return <span className="save-state ready">Ready</span>;
}
