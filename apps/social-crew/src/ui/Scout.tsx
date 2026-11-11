import type { DeskProps } from "./model";

export function Scout({ state, dispatch }: DeskProps) {
  const report = state.scout;
  if (!report) {
    return (
      <section className="panel empty">
        <h2>Scout is waiting</h2>
        <p>Give the Manager a topic. The sweep is a fixture, not a live read.</p>
      </section>
    );
  }

  return (
    <div className="stack">
      <section className="panel">
        <header className="panel-head">
          <h2>Grounded brief</h2>
          <p>
            {report.windowStart} to {report.windowEnd}. Sources: {report.sources.join(", ")}. Simulated signals only.
          </p>
        </header>
        <p className="lede">{report.summary}</p>
      </section>
      <section className="panel" data-testid="radar">
        <header className="panel-head">
          <h2>Opportunity radar</h2>
          <p>Composite weighs demand, evidence, low crowding, timing, and fit. Each angle keeps a counterexample.</p>
        </header>
        <ol className="angles">
          {report.opportunities.map((angle, index) => (
            <li key={angle.id}>
              <div className="angle-top">
                <span>{index + 1}</span>
                <strong>{angle.claim}</strong>
                <b>{angle.composite}</b>
              </div>
              <p>{angle.angle}</p>
              <div className="meters">
                <Meter label="Demand" value={angle.demand} />
                <Meter label="Evidence" value={angle.evidence} />
                <Meter label="Crowding" value={angle.competition} />
                <Meter label="Timing" value={angle.timing} />
                <Meter label="Fit" value={angle.fit} />
              </div>
              <p className="fine">
                Counterexample: {angle.counterexample} Next test: {angle.nextTest} Evidence: {angle.evidenceIds.join(", ")}.
              </p>
            </li>
          ))}
        </ol>
      </section>
      <div className="split">
        <section className="panel">
          <header className="panel-head">
            <h2>Evidence</h2>
            <p>{report.evidence.length} fixtures inside the window.</p>
          </header>
          <ul className="feed">
            {report.evidence.map((item) => (
              <li key={item.id}>
                <div className="step-top">
                  <em>{item.source}</em>
                  <span>{item.date}</span>
                  <span>{item.engagement}</span>
                </div>
                <strong>{item.title}</strong>
                <p>{item.excerpt}</p>
                <code>{item.url}</code>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <header className="panel-head">
            <h2>Listening</h2>
            <p>Hits worth a human reply. The crew will not send one.</p>
          </header>
          <ul className="feed">
            {report.mentions.map((item) => (
              <li key={item.id}>
                <div className="step-top">
                  <em>{item.source}</em>
                  <span>match {item.matchScore}</span>
                </div>
                <p>{item.text}</p>
                <p className="fine">{item.why}</p>
              </li>
            ))}
          </ul>
          <button type="button" className="btn ghost" onClick={() => dispatch({ type: "keep-reply-human" })}>
            I will write the reply
          </button>
        </section>
      </div>
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <label className="meter-line">
      <span>{label}</span>
      <i>
        <b style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </i>
      <em>{value}</em>
    </label>
  );
}
