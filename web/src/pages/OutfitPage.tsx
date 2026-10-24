import { type FormEvent, useState } from "react";
import { type AgentResult, api, ApiError } from "../api";
import { ItemPhoto } from "../components/ItemCard";
import { describeStep } from "../trace";
import { CATEGORY_SINGULAR, FORMALITY_LABEL, sortHeadToToe } from "../wardrobe";

const EXAMPLES: { request: string; location?: string }[] = [
  { request: "dinner, 45 degrees, smart casual" },
  { request: "job interview tomorrow morning", location: "Chicago" },
  { request: "beach day, 90 degrees" },
];

const FAILURE_MESSAGES: Record<string, string> = {
  max_iterations: "Claude couldn't settle on an outfit within its step limit. Try rephrasing the request.",
  refused: "Claude declined this request.",
  truncated: "The response was cut off. Please try again.",
};

export function OutfitPage() {
  const [request, setRequest] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ data: AgentResult; seconds: number } | null>(null);

  async function build(req: string, loc: string) {
    setBusy(true);
    setError(null);
    setResult(null);
    const started = performance.now();
    try {
      const data = await api<AgentResult>("/outfits", {
        method: "POST",
        json: { request: req, ...(loc.trim() ? { location: loc.trim() } : {}) },
      });
      setResult({ data, seconds: (performance.now() - started) / 1000 });
    } catch (err) {
      // 422 carries a full agent result explaining why no outfit was produced.
      if (err instanceof ApiError && err.status === 422) setError(FAILURE_MESSAGES[err.code] ?? err.message);
      else setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (request.trim()) build(request, location);
  }

  const outfit = result?.data.outfit;

  return (
    <section className="outfit-page">
      <h1>What's the occasion?</h1>
      <p className="muted">Describe the plan, and the weather if you know it. Claude picks from your wardrobe only.</p>

      <form className="outfit-form" onSubmit={onSubmit}>
        <textarea
          rows={2}
          maxLength={500}
          placeholder="e.g. dinner, 45 degrees, smart casual"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) onSubmit(e);
          }}
        />
        <div className="outfit-form-row">
          <input placeholder="City (optional, for the forecast)" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={100} />
          <button className="primary" type="submit" disabled={busy || !request.trim()}>
            {busy ? "Building…" : "Build outfit"}
          </button>
        </div>
      </form>

      <div className="examples">
        <span className="muted small">Try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.request}
            className="chip"
            disabled={busy}
            onClick={() => {
              setRequest(ex.request);
              setLocation(ex.location ?? "");
              build(ex.request, ex.location ?? "");
            }}
          >
            {ex.request}{ex.location ? ` · ${ex.location}` : ""}
          </button>
        ))}
      </div>

      {busy && <p className="muted thinking">Claude is checking the weather and searching your wardrobe… this takes about 15 seconds.</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {result && outfit && (
        <div className="result">
          <div className="result-chips">
            <span className="chip static">Planned for {outfit.temperatureF}°F</span>
            <span className="chip static">{FORMALITY_LABEL[outfit.targetFormality]}</span>
          </div>

          <div className="outfit-row">
            {sortHeadToToe(outfit.items).map((item) => (
              <figure key={item.id} className="outfit-item">
                <ItemPhoto item={item} />
                <figcaption>
                  <span className="muted small">{CATEGORY_SINGULAR[item.category]}</span>
                  <span className="item-name">{item.name}</span>
                </figcaption>
              </figure>
            ))}
          </div>

          <p className="explanation">{outfit.explanation}</p>

          {outfit.warnings.length > 0 && (
            <ul className="warnings">
              {outfit.warnings.map((w) => <li key={w.rule}>{w.detail}</li>)}
            </ul>
          )}

          <details className="trace">
            <summary>How Claude decided</summary>
            <ol>
              {result.data.trace.map((step, i) => <li key={i}>{describeStep(step)}</li>)}
            </ol>
            <p className="muted small">
              {result.data.iterations} model calls · {result.seconds.toFixed(1)}s
            </p>
          </details>
        </div>
      )}
    </section>
  );
}
