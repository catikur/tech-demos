import { historyHeat } from "../engine/analyst";
import { DAY_LABELS, suggestBestTimes, buildHeatmap } from "../engine/timing";
import type { DeskProps } from "./model";

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

export function Analyst({ state }: DeskProps) {
  const report = state.daily;
  if (!report) {
    return (
      <section className="panel empty">
        <h2>No daily note yet</h2>
        <p>The analyst writes after a Manager run, from a simulated history.</p>
      </section>
    );
  }
  const heat = historyHeat(report.posts);
  const max = Math.max(1, ...heat.flat());
  const next = suggestBestTimes(buildHeatmap(state.topic), 3);

  return (
    <div className="stack">
      <section className="kpis">
        <article>
          <span>Posts</span>
          <strong>{report.postCount}</strong>
        </article>
        <article>
          <span>Impressions</span>
          <strong>{report.impressions.toLocaleString("en-US")}</strong>
        </article>
        <article>
          <span>Bookmarks</span>
          <strong>{report.bookmarks.toLocaleString("en-US")}</strong>
        </article>
        <article>
          <span>Bookmark rate</span>
          <strong>{(report.bookmarkRate * 100).toFixed(2)}%</strong>
        </article>
        <article>
          <span>Best blended</span>
          <strong>{report.bestBlended}</strong>
        </article>
      </section>
      <div className="split">
        <section className="panel">
          <header className="panel-head">
            <h2>Scored history</h2>
            <p>Bookmark rate, hook score, thread depth, posting hour, then a weighted blend. Not a live export.</p>
          </header>
          <table>
            <thead>
              <tr>
                <th>Post</th>
                <th>Hook</th>
                <th>Saves</th>
                <th>Depth</th>
                <th>Hour</th>
                <th>Blend</th>
              </tr>
            </thead>
            <tbody>
              {report.posts.map((post) => (
                <tr key={post.id} className={post.id === report.bestId ? "best" : ""}>
                  <td>{post.text}</td>
                  <td>
                    {post.hookPattern} {post.score.hookScore}
                  </td>
                  <td>{(post.score.bookmarkRate * 100).toFixed(2)}%</td>
                  <td>{post.score.threadDepth}</td>
                  <td>
                    {DAY_LABELS[post.day]} {String(post.hour).padStart(2, "0")}:00
                  </td>
                  <td>{post.score.blended}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="panel">
          <header className="panel-head">
            <h2>When the history landed</h2>
            <p>
              Next suggested hours: {next.map((slot) => `${DAY_LABELS[slot.day]} ${String(slot.hour).padStart(2, "0")}:00`).join(", ")}.
            </p>
          </header>
          <div className="heat">
            <span />
            {HOURS.map((hour) => (
              <span key={hour}>{hour}</span>
            ))}
            {DAY_LABELS.map((label, day) => (
              <HeatRow key={label} label={label} day={day} heat={heat} max={max} />
            ))}
          </div>
        </section>
      </div>
      <article className="panel memo" data-testid="daily-report">
        <header className="panel-head">
          <h2>Daily note · {report.date}</h2>
          <p>Lens: {report.topic}. Hook pattern in the lead: {report.hookLeader}.</p>
        </header>
        {report.caveat ? <p className="warn">{report.caveat}</p> : <p>The sample is large enough to rank, not large enough to arm a routine.</p>}
        <ul>
          {report.recommendations.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </article>
    </div>
  );
}

function HeatRow({ label, day, heat, max }: { label: string; day: number; heat: number[][]; max: number }) {
  return (
    <>
      <span>{label}</span>
      {HOURS.map((hour) => {
        const count = heat[day]?.[hour] ?? 0;
        return <i key={hour} style={{ opacity: count === 0 ? 0.12 : 0.25 + (count / max) * 0.75 }} title={`${count}`} />;
      })}
    </>
  );
}
