import { useCallback, useEffect, useState } from "react";
import { PACKS, getPack } from "../data/packs.ts";
import {
  beginRun,
  currentBeat,
  leanChoice,
  playYear,
  statLabel,
  type Pack,
  type Reason,
  type Run,
  type Year,
} from "../engine/sim.ts";
import { drawCard } from "./share.ts";
import { LifeWorld, type Mark } from "./world.tsx";

type Phase = "home" | "birth" | "life" | "end";
type Moment = "pick" | "roll" | "landed";

type Pending = {
  run: Run;
  year: Year;
};

export function App() {
  const [packId, setPackId] = useState(PACKS[0]!.id);
  const [phase, setPhase] = useState<Phase>("home");
  const [moment, setMoment] = useState<Moment>("pick");
  const [run, setRun] = useState<Run | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [watching, setWatching] = useState(false);
  const [reel, setReel] = useState(false);
  const [card, setCard] = useState("");
  const [shotOf, setShotOf] = useState<(() => string) | null>(null);

  const pack = getPack(packId) ?? PACKS[0]!;
  const hue = (run ? pack.origins.find((item) => item.id === run.originId)?.hue : pack.origins[0]?.hue) ?? 28;
  const worldKey = run ? `${run.packId}-${run.seed}` : `home-${pack.id}`;

  const acceptShot = useCallback((shot: () => string) => {
    setShotOf(() => shot);
  }, []);

  const visibleYears = pending && moment === "landed" ? [...(run?.years ?? []), pending.year] : (run?.years ?? []);
  const marks: Mark[] = visibleYears.map((year) => ({ prop: year.prop, hit: year.hit }));

  const choose = (choiceId: string) => {
    if (!run || moment !== "pick") return;
    const step = playYear(pack, run, choiceId);
    setPending({ run: step.run, year: step.year });
    setMoment("roll");
  };

  const commit = () => {
    if (!pending) return;
    const next = pending.run;
    setRun(next);
    setPending(null);
    setMoment("pick");
    if (next.closed) setPhase("end");
  };

  useEffect(() => {
    if (moment !== "roll") return;
    const timer = window.setTimeout(() => setMoment("landed"), 1200);
    return () => window.clearTimeout(timer);
  }, [moment, pending?.year.beatId]);

  useEffect(() => {
    if (!watching || phase !== "life" || !run) return;
    if (moment === "pick" && currentBeat(pack, run)) {
      const timer = window.setTimeout(() => choose(leanChoice(pack, run).id), 700);
      return () => window.clearTimeout(timer);
    }
    if (moment === "landed") {
      const timer = window.setTimeout(commit, 900);
      return () => window.clearTimeout(timer);
    }
    return;
  }, [watching, moment, phase, run, pack]);

  useEffect(() => {
    if (phase !== "end" || !run) return;
    const timer = window.setTimeout(() => {
      const shot = shotOf?.() ?? "";
      void drawCard(pack, run, shot).then(setCard);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [phase, run, pack, shotOf]);

  const born = () => {
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0;
    setRun(beginRun(pack, seed));
    setPending(null);
    setCard("");
    setWatching(false);
    setMoment("pick");
    setReel(true);
    setPhase("birth");
    window.setTimeout(() => setReel(false), 1400);
  };

  return (
    <div className="app">
      <LifeWorld hue={hue} marks={marks} worldKey={worldKey} onSnapshot={acceptShot} />
      <div className="veil">
        <header className="top">
          <div>
            <p className="brand">Life Loom</p>
            <p className="quiet">Karar istatistiği kaydırır. Yıl, o yüzdeyle tutar ya da kaçar.</p>
          </div>
          {run && phase !== "home" && (
            <p className="who">
              {run.name}
              <span>
                {pack.role} · {pack.origins.find((item) => item.id === run.originId)?.name}
              </span>
            </p>
          )}
        </header>

        {phase === "home" && <Home pack={pack} onPick={setPackId} onBorn={born} />}
        {phase === "birth" && run && (
          <Birth pack={pack} run={run} reel={reel} onBegin={() => setPhase("life")} />
        )}
        {phase === "life" && run && (
          <Life
            pack={pack}
            run={run}
            moment={moment}
            pending={pending}
            watching={watching}
            onChoose={choose}
            onCommit={commit}
            onWatch={() => setWatching(true)}
            onHome={() => {
              setWatching(false);
              setPhase("home");
              setRun(null);
            }}
          />
        )}
        {phase === "end" && run && (
          <End
            card={card}
            onAgain={born}
            onHome={() => {
              setPhase("home");
              setRun(null);
              setCard("");
            }}
          />
        )}
      </div>
    </div>
  );
}

function Home({ pack, onPick, onBorn }: { pack: Pack; onPick: (id: string) => void; onBorn: () => void }) {
  return (
    <section className="home">
      <div className="careers">
        {PACKS.map((item) => (
          <button key={item.id} className={item.id === pack.id ? "on" : ""} onClick={() => onPick(item.id)}>
            <b>{item.name}</b>
            <span>{item.pitch}</span>
          </button>
        ))}
      </div>
      <button className="gold" onClick={onBorn}>
        Bu hayata başla
      </button>
      <p className="quiet bench">
        Aynı motor, başka dosya. Yeni bir meslek için <code>src/data/careers/</code> altına bir paket kopyala.
        Yer, tarz ve her yılın olasılığı orada durur.
      </p>
    </section>
  );
}

function Birth({ pack, run, reel, onBegin }: { pack: Pack; run: Run; reel: boolean; onBegin: () => void }) {
  const origin = pack.origins.find((item) => item.id === run.originId)!;
  const lifestyle = pack.lifestyles.find((item) => item.id === run.lifestyleId)!;
  const [spin, setSpin] = useState(0);
  useEffect(() => {
    if (!reel) return;
    const timer = window.setInterval(() => setSpin((value) => value + 1), 80);
    return () => window.clearInterval(timer);
  }, [reel]);
  const shown = pack.origins[spin % pack.origins.length]!;
  return (
    <section className="sheet">
      <p className="kicker">{reel ? "Yer ve tarz çekiliyor" : "Kayıt"}</p>
      <h2 style={{ color: `hsl(${(reel ? shown.hue : origin.hue)} 70% 64%)` }}>
        {reel ? shown.name : origin.name}
      </h2>
      {!reel && (
        <>
          <p className="lead">
            {run.name}, {lifestyle.name.toLowerCase()} olarak. {origin.blurb} {lifestyle.blurb}
          </p>
          <Meters pack={pack} stats={run.stats} />
          <button className="gold" onClick={onBegin}>
            İlk yıla gir
          </button>
        </>
      )}
    </section>
  );
}

function Life({
  pack,
  run,
  moment,
  pending,
  watching,
  onChoose,
  onCommit,
  onWatch,
  onHome,
}: {
  pack: Pack;
  run: Run;
  moment: Moment;
  pending: Pending | null;
  watching: boolean;
  onChoose: (id: string) => void;
  onCommit: () => void;
  onWatch: () => void;
  onHome: () => void;
}) {
  const beat = currentBeat(pack, run);
  const year = pending?.year;
  return (
    <section className="life">
      <Meters pack={pack} stats={moment === "landed" && year ? year.stats : run.stats} />
      {moment === "pick" && beat && (
        <>
          <p className="kicker">
            {beat.years} · {beat.title}
          </p>
          <h2>{beat.hook}</h2>
          <div className="choices">
            {beat.choices.map((choice, index) => (
              <button key={choice.id} disabled={watching} onClick={() => onChoose(choice.id)}>
                <span className="key">{index + 1}</span>
                <b>{choice.label}</b>
                <span>{choice.detail}</span>
                <span className="pills">
                  {Object.entries(choice.effects).map(([key, value]) => (
                    <em key={key} className={value > 0 ? "up" : "down"}>
                      {value > 0 ? "+" : ""}
                      {value} {statLabel(pack, key).toLowerCase()}
                    </em>
                  ))}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      {moment !== "pick" && year && beat && (
        <Chance
          pack={pack}
          run={run}
          title={beat.check.title}
          year={year}
          showRoll={moment === "landed"}
        />
      )}
      <div className="actions">
        {moment === "landed" && (
          <button className="gold" onClick={onCommit}>
            {pending?.run.closed ? "Hayatı kapat" : "Sonraki yıl"}
          </button>
        )}
        {moment === "pick" && (
          <button className="ghost" onClick={onWatch} disabled={watching}>
            {watching ? "Heykel büyüyor" : "Kalanını izle"}
          </button>
        )}
        <button className="ghost" onClick={onHome}>
          Mesleklere dön
        </button>
      </div>
    </section>
  );
}

function Chance({
  pack,
  run,
  title,
  year,
  showRoll,
}: {
  pack: Pack;
  run: Run;
  title: string;
  year: Year;
  showRoll: boolean;
}) {
  const origin = pack.origins.find((item) => item.id === run.originId);
  const lifestyle = pack.lifestyles.find((item) => item.id === run.lifestyleId);
  return (
    <div className="chance">
      <p className="kicker">{title}</p>
      <h2>%{Math.round(year.p * 100)}</h2>
      <div className="bar">
        <i style={{ width: `${year.p * 100}%` }} />
        {showRoll && <b style={{ left: `${year.roll * 100}%` }} />}
      </div>
      <ul className="reasons">
        {year.reasons.map((reason) => (
          <li key={reason.key}>{reasonText(pack, origin?.name ?? "", lifestyle?.name ?? "", reason)}</li>
        ))}
      </ul>
      {showRoll && (
        <>
          <p className={year.hit ? "hit" : "miss"}>{year.hit ? "Tuttu" : "Kaçtı"}</p>
          <p className="lead">{year.line}</p>
        </>
      )}
    </div>
  );
}

function reasonText(pack: Pack, origin: string, lifestyle: string, reason: Reason): string {
  const points = Math.round(reason.delta * 100);
  const sign = points > 0 ? "+" : "";
  if (reason.key.startsWith("yer:")) return `${origin} ${sign}${points}`;
  if (reason.key.startsWith("tarz:")) return `${lifestyle} ${sign}${points}`;
  if (reason.key.startsWith("iz:")) return `önceki iz ${sign}${points}`;
  return `${statLabel(pack, reason.key)} ${sign}${points}`;
}

function End({ card, onAgain, onHome }: { card: string; onAgain: () => void; onHome: () => void }) {
  const download = () => {
    if (!card) return;
    const link = document.createElement("a");
    link.href = card;
    link.download = "hayat.png";
    link.click();
  };
  return (
    <section className="end">
      {card ? <img src={card} alt="Bu hayatın infografiği" /> : <p className="quiet">İnfografik hazırlanıyor.</p>}
      <div className="actions">
        <button className="gold" onClick={download} disabled={!card}>
          İnfografiği indir
        </button>
        <button className="ghost" onClick={onAgain}>
          Aynı meslekte yeniden
        </button>
        <button className="ghost" onClick={onHome}>
          Başka meslek
        </button>
      </div>
    </section>
  );
}

function Meters({ pack, stats }: { pack: Pack; stats: Record<string, number> }) {
  return (
    <div className="meters">
      {pack.stats.map((stat) => (
        <div key={stat.key}>
          <span>
            {stat.label}
            {stat.key === pack.vital ? " · hayat" : ""}
          </span>
          <i>
            <b style={{ width: `${stats[stat.key] ?? 0}%` }} />
          </i>
          <em>{stats[stat.key] ?? 0}</em>
        </div>
      ))}
    </div>
  );
}
