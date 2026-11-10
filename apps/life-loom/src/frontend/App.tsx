import { useEffect, useState, type CSSProperties } from "react";
import { PACKS, getPack } from "../data/packs.ts";
import {
  autoRest,
  beginRun,
  choose,
  claims,
  currentStage,
  type Ending,
  type Pack,
  type Run,
  type Shadow,
  type StatKey,
  type Stats,
} from "../engine/sim.ts";
import { Scene } from "./scene.tsx";

type Phase = "home" | "birth" | "life" | "end";

const STATS: { key: StatKey; label: string }[] = [
  { key: "body", label: "Beden" },
  { key: "joy", label: "Neşe" },
  { key: "bond", label: "Bağ" },
];

const MODULES = [
  {
    name: "Dünya paketi",
    why: "Aynı döngü, başka bir fikir. Ülke verisi değil, senin yazdığın yerler.",
    where: "src/data/packs.ts",
  },
  {
    name: "Ağırlıklı çekiliş",
    why: "Doğum yeri seçilmez. Sık olan yerin weight değeri büyüktür.",
    where: "weightedPick",
  },
  {
    name: "Hane",
    why: "Başlangıç halkalarını kaydırır. Hayat sıfırdan değil, bir sofradan başlar.",
    where: "households",
  },
  {
    name: "Perde",
    why: "Seksen yıl yerine altı net karar. Her perde bir yaş aralığıdır.",
    where: "stages",
  },
  {
    name: "Seçim + şans zarı",
    why: "Seçim halkayı kaydırır, zar sonucu garanti etmez. İkisi de ekranda görünür.",
    where: "choose",
  },
  {
    name: "Kapanış kuralı",
    why: "İlk uyan kural kazanır. Bayrak, en yüksek halkadan önce gelir.",
    where: "endings",
  },
];

export function App() {
  const [packId, setPackId] = useState(PACKS[0]!.id);
  const [phase, setPhase] = useState<Phase>("home");
  const [run, setRun] = useState<Run | null>(null);
  const [shadow, setShadow] = useState<Shadow | null>(null);
  const [ending, setEnding] = useState<Ending | null>(null);
  const [reel, setReel] = useState(false);
  const [watch, setWatch] = useState<{ run: Run; ending: Ending; shown: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const pack = getPack(packId) ?? PACKS[0]!;

  useEffect(() => {
    if (!watch || phase !== "life") return;
    if (watch.shown >= watch.run.beats.length) {
      setRun(watch.run);
      setEnding(watch.ending);
      setWatch(null);
      setPhase("end");
      return;
    }
    const timer = setTimeout(() => {
      setWatch((current) => (current ? { ...current, shown: current.shown + 1 } : current));
    }, 900);
    return () => clearTimeout(timer);
  }, [watch, phase]);

  const displayed: Run | null = watch
    ? {
        ...watch.run,
        beats: watch.run.beats.slice(0, watch.shown),
        stats: watch.shown === 0 ? watch.run.origin : watch.run.beats[watch.shown - 1]!.stats,
        flags: watch.shown === 0 ? [] : watch.run.beats[watch.shown - 1]!.flags,
      }
    : run;

  useEffect(() => {
    if (phase !== "life") return;
    const last = displayed?.beats[displayed.beats.length - 1];
    if (!last) return;
    document.getElementById(`beat-${last.stageId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [phase, displayed]);

  const startBirth = () => {
    const next = beginRun(pack, (Date.now() ^ (Math.random() * 0x100000000)) >>> 0);
    setRun(next.run);
    setShadow(next.shadow);
    setEnding(null);
    setWatch(null);
    setReel(true);
    setPhase("birth");
    window.setTimeout(() => setReel(false), 1300);
  };

  const pick = (choiceId: string) => {
    if (!run || watch) return;
    const step = choose(pack, run, choiceId);
    setRun(step.run);
    if (step.ending) {
      setEnding(step.ending);
      setPhase("end");
    }
  };

  const playRest = () => {
    if (!run || watch) return;
    const done = autoRest(pack, run);
    setWatch({ run: done.run, ending: done.ending, shown: run.beats.length });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (phase !== "life" || !displayed || watch) return;
      const stage = currentStage(pack, displayed);
      const index = Number(event.key) - 1;
      const choice = stage?.choices[index];
      if (choice) pick(choice.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const jump = (stageId: string) => {
    setFlash(stageId);
    document.getElementById(`beat-${stageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => setFlash(null), 1600);
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <div>
            <h1>Life Loom</h1>
            <p>Altı perdelik hayat. Dünya bir veri paketi.</p>
          </div>
        </div>
        <p className="credit">
          1in8b.life’ın herkese açık döngüsünden çıkarılmış özgün motor. Onların kodu, verisi ve metni yok.
        </p>
      </header>

      {phase === "home" && (
        <Home
          pack={pack}
          onPick={setPackId}
          onBorn={startBirth}
        />
      )}

      {phase === "birth" && displayed && shadow && (
        <Birth
          pack={pack}
          run={displayed}
          reel={reel}
          onBegin={() => setPhase("life")}
        />
      )}

      {phase === "life" && displayed && (
        <Life
          pack={pack}
          run={displayed}
          watching={Boolean(watch)}
          onPick={pick}
          onWatch={playRest}
          onQuit={() => setPhase("home")}
        />
      )}

      {phase === "end" && displayed && ending && shadow && (
        <EndingView
          pack={pack}
          run={displayed}
          ending={ending}
          shadow={shadow}
          flash={flash}
          onJump={jump}
          onAgain={startBirth}
          onHome={() => setPhase("home")}
        />
      )}
    </div>
  );
}

function Home({ pack, onPick, onBorn }: { pack: Pack; onPick: (id: string) => void; onBorn: () => void }) {
  const maxW = Math.max(...pack.places.map((place) => place.weight));
  return (
    <main className="home">
      <section className="worlds">
        {PACKS.map((item) => (
          <button
            key={item.id}
            className={`world ${item.id === pack.id ? "on" : ""}`}
            onClick={() => onPick(item.id)}
            style={{ "--hue": item.places[0]?.hue ?? 30 } as CSSProperties}
          >
            <span className="swatch" style={{ background: `hsl(${item.places[0]?.hue ?? 30} 50% 42%)` }} />
            <strong>{item.name}</strong>
            <span>{item.pitch}</span>
          </button>
        ))}
        <button className="born" onClick={onBorn}>
          Bu dünyada doğ
        </button>
      </section>

      <section className="bench">
        <h2>Tezgâh · {pack.name}</h2>
        <p className="lede">
          Yeni bir hayat simülasyonu için motoru değil paketi değiştir. Yer, hane, perde ve kapanış
          yeterli.
        </p>
        <ol className="modules">
          {MODULES.map((mod, index) => (
            <li key={mod.name}>
              <b>
                {index + 1}. {mod.name}
              </b>
              <span>{mod.why}</span>
              <code>{mod.where}</code>
            </li>
          ))}
        </ol>
        <div className="bench-grid">
          <div>
            <h3>Yerler</h3>
            <ul className="bars">
              {pack.places.map((place) => (
                <li key={place.id}>
                  <span>{place.name}</span>
                  <i style={{ width: `${(place.weight / maxW) * 100}%`, background: `hsl(${place.hue} 55% 48%)` }} />
                  <em>{place.weight}</em>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Perdeler</h3>
            <ol className="stages">
              {pack.stages.map((stage) => (
                <li key={stage.id}>
                  <b>{stage.years}</b> {stage.title}
                  <small>{stage.choices.map((choice) => choice.label).join(" · ")}</small>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </main>
  );
}

function Birth({
  pack,
  run,
  reel,
  onBegin,
}: {
  pack: Pack;
  run: Run;
  reel: boolean;
  onBegin: () => void;
}) {
  const place = pack.places.find((item) => item.id === run.placeId)!;
  const home = pack.households.find((item) => item.id === run.householdId)!;
  const [spin, setSpin] = useState(0);
  useEffect(() => {
    if (!reel) return;
    const timer = setInterval(() => setSpin((value) => value + 1), 90);
    return () => clearInterval(timer);
  }, [reel]);
  const spinning = pack.places[spin % pack.places.length]!;
  return (
    <main className="birth">
      <p className="kicker">{reel ? "Yer çekiliyor" : "Doğum kaydı"}</p>
      <h2 style={{ color: `hsl(${place.hue} 70% 72%)` }}>{reel ? spinning.name : place.name}</h2>
      {!reel && (
        <article className="cert">
          <p className="who">{run.name}</p>
          <p>{place.blurb}</p>
          <p>
            <b>{home.name}.</b> {home.blurb}
          </p>
          <Rings stats={run.origin} />
          <button className="born" onClick={onBegin}>
            Bu hayata başla
          </button>
        </article>
      )}
    </main>
  );
}

function Life({
  pack,
  run,
  watching,
  onPick,
  onWatch,
  onQuit,
}: {
  pack: Pack;
  run: Run;
  watching: boolean;
  onPick: (id: string) => void;
  onWatch: () => void;
  onQuit: () => void;
}) {
  const stage = currentStage(pack, run);
  const place = pack.places.find((item) => item.id === run.placeId)!;
  const index = Math.min(run.beats.length, pack.stages.length - 1);
  const shown = stage ?? pack.stages[index]!;
  return (
    <main className="life">
      <div className="path" aria-label="Hayat yolu">
        {pack.stages.map((item, i) => (
          <span key={item.id} className={i < index ? "done" : i === index ? "now" : ""}>
            <i />
            {item.title}
          </span>
        ))}
      </div>
      <section className="stage">
        <Scene hue={place.hue} motif={shown.motif} stageIndex={index} caption={`${run.name}, ${shown.title}`} />
        <div className="stage-copy">
          <p className="kicker">
            {run.name} · {place.name} · {shown.years}
          </p>
          <h2>{shown.title}</h2>
          <p>{stage ? shown.prompt : "Kapanış yazılıyor."}</p>
          <Rings stats={run.stats} />
          <div className="actions">
            <button className="ghost" onClick={onWatch} disabled={watching || !stage}>
              {watching ? "İzleniyor" : "Kalanını izle"}
            </button>
            <button className="ghost" onClick={onQuit}>
              Dünyalara dön
            </button>
          </div>
        </div>
      </section>
      <section className="choices">
        {stage?.choices.map((choice, i) => (
          <button key={choice.id} disabled={watching} onClick={() => onPick(choice.id)}>
            <span className="key">{i + 1}</span>
            <strong>{choice.label}</strong>
            <span>{choice.detail}</span>
            <span className="pills">
              {STATS.map((stat) => {
                const delta = choice.effects[stat.key];
                if (!delta) return null;
                return (
                  <em key={stat.key} className={delta > 0 ? "up" : "down"}>
                    {delta > 0 ? "+" : ""}
                    {delta} {stat.label.toLowerCase()}
                  </em>
                );
              })}
            </span>
          </button>
        ))}
      </section>
      <Chronicle pack={pack} run={run} flash={null} />
    </main>
  );
}

function EndingView({
  pack,
  run,
  ending,
  shadow,
  flash,
  onJump,
  onAgain,
  onHome,
}: {
  pack: Pack;
  run: Run;
  ending: Ending;
  shadow: Shadow;
  flash: string | null;
  onJump: (id: string) => void;
  onAgain: () => void;
  onHome: () => void;
}) {
  const shadowEnding = pack.endings.find((item) => item.id === shadow.endingId);
  const lines = claims(pack, run, ending);
  return (
    <main className="end">
      <p className="kicker">{run.name} · {pack.name}</p>
      <h2>{ending.title}</h2>
      <p className="epilogue">{ending.text}</p>
      <ul className="claims">
        {lines.map((line) => (
          <li key={line.text}>
            <p>{line.text}</p>
            {line.stageId && (
              <button className="chip" onClick={() => onJump(line.stageId!)}>
                {pack.stages.find((stage) => stage.id === line.stageId)?.title}
              </button>
            )}
          </li>
        ))}
      </ul>
      <Chronicle pack={pack} run={run} flash={flash} />
      <aside className="shadow">
        <h3>Aynı kural, başka tohum</h3>
        <p>
          {shadow.name}, {shadow.placeName} bölgesinde doğdu ve «{shadowEnding?.title ?? "başka bir akşam"}»
          ile kapandı.
        </p>
        <p className="tiny">{shadow.choices.join(" → ")}</p>
      </aside>
      <div className="actions">
        <button className="born" onClick={onAgain}>
          Yeniden doğ
        </button>
        <button className="ghost" onClick={onHome}>
          Diğer dünya
        </button>
      </div>
    </main>
  );
}

function Rings({ stats }: { stats: Stats }) {
  return (
    <div className="rings">
      {STATS.map((stat) => {
        const value = stats[stat.key];
        const r = 26;
        const circ = 2 * Math.PI * r;
        return (
          <div key={stat.key} className="ring">
            <svg viewBox="0 0 68 68" aria-hidden="true">
              <circle cx="34" cy="34" r={r} className="track" />
              <circle
                cx="34"
                cy="34"
                r={r}
                className="value"
                strokeDasharray={`${(value / 100) * circ} ${circ}`}
              />
            </svg>
            <b>{value}</b>
            <span>{stat.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Chronicle({ pack, run, flash }: { pack: Pack; run: Run; flash: string | null }) {
  return (
    <ol className="chronicle">
      {run.beats.map((beat) => {
        const stage = pack.stages.find((item) => item.id === beat.stageId);
        const stat = STATS.find((item) => item.key === beat.luck.stat);
        const sign = beat.luck.delta > 0 ? "+" : "";
        return (
          <li key={beat.stageId} id={`beat-${beat.stageId}`} className={flash === beat.stageId ? "flash" : ""}>
            <b>
              {stage?.title}
              <span className="luck">
                {" "}
                · zar {stat?.label.toLowerCase()} {sign}
                {beat.luck.delta}
              </span>
            </b>
            <span>{beat.line}</span>
          </li>
        );
      })}
    </ol>
  );
}
