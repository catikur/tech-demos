import { useMemo, useState } from "react";
import { derivePrimitivesGraph } from "../indicators/graph.ts";
import { getIndicator } from "../indicators/indicators.ts";
import { PRIMITIVE_INFO, type PrimitiveId } from "../indicators/primitives.ts";

const WIDTH = 860;
const NODE_W = 170;
const ROW_H = 58;
const PAD_Y = 36;

export function PrimitivesGraph() {
  const graph = useMemo(() => derivePrimitivesGraph(), []);
  const [selected, setSelected] = useState<string | null>(null);

  const height = PAD_Y * 2 + Math.max(graph.indicators.length, graph.primitives.length) * ROW_H;
  const indX = 30;
  const primX = WIDTH - NODE_W - 30;

  const indY = (i: number) =>
    PAD_Y + i * ROW_H + ((Math.max(graph.primitives.length, graph.indicators.length) - graph.indicators.length) * ROW_H) / 2;
  const primY = (i: number) =>
    PAD_Y + i * ROW_H + ((Math.max(graph.primitives.length, graph.indicators.length) - graph.primitives.length) * ROW_H) / 2;

  const connected = useMemo(() => {
    const set = new Set<string>();
    if (!selected) return set;
    set.add(selected);
    for (const e of graph.edges) {
      if (`i:${e.indicator}` === selected) set.add(`p:${e.primitive}`);
      if (`p:${e.primitive}` === selected) set.add(`i:${e.indicator}`);
    }
    return set;
  }, [selected, graph]);

  const isDim = (id: string) => selected !== null && !connected.has(id);
  const edgeActive = (ind: string, prim: PrimitiveId) =>
    selected === null || selected === `i:${ind}` || selected === `p:${prim}`;

  const usedPrimitives = new Set(graph.edges.map((e) => e.primitive));

  const selectedInfo = (() => {
    if (!selected) return null;
    if (selected.startsWith("i:")) {
      const def = getIndicator(selected.slice(2));
      const prims = graph.edges.filter((e) => e.indicator === def.id).map((e) => PRIMITIVE_INFO[e.primitive].name);
      return `${def.name} is built from: ${prims.join(" + ")}.`;
    }
    const pid = selected.slice(2) as PrimitiveId;
    const users = graph.edges.filter((e) => e.primitive === pid).map((e) => getIndicator(e.indicator).name);
    const info = PRIMITIVE_INFO[pid];
    return users.length > 0
      ? `${info.name} (${info.desc}) — used by: ${users.join(", ")}.`
      : `${info.name} (${info.desc}) — not used by any indicator in this set, but it powers classics like Stochastic and Donchian channels.`;
  })();

  return (
    <div className="graph-wrap">
      <p className="graph-note">
        Derived from the implementations: each indicator computes through an instrumented primitives
        toolkit, and an edge exists only if the indicator <em>actually called</em> that primitive.
        Click any node to trace its connections.
      </p>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="graph-svg"
        role="img"
        aria-label="Indicator to primitive dependency graph"
      >
        <text x={indX + NODE_W / 2} y={18} className="graph-col-label" textAnchor="middle">
          INDICATORS
        </text>
        <text x={primX + NODE_W / 2} y={18} className="graph-col-label" textAnchor="middle">
          SHARED PRIMITIVES
        </text>

        {graph.edges.map((e) => {
          const i = graph.indicators.indexOf(e.indicator);
          const p = graph.primitives.indexOf(e.primitive);
          const x1 = indX + NODE_W;
          const y1 = indY(i) + 19;
          const x2 = primX;
          const y2 = primY(p) + 19;
          const mx = (x1 + x2) / 2;
          const active = edgeActive(e.indicator, e.primitive);
          return (
            <path
              key={`${e.indicator}-${e.primitive}`}
              d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
              className={`graph-edge ${active ? "active" : "dim"}`}
            />
          );
        })}

        {graph.indicators.map((id, i) => (
          <g
            key={id}
            transform={`translate(${indX}, ${indY(i)})`}
            className={`graph-node indicator ${isDim(`i:${id}`) ? "dim" : ""} ${selected === `i:${id}` ? "selected" : ""}`}
            onClick={() => setSelected(selected === `i:${id}` ? null : `i:${id}`)}
          >
            <rect width={NODE_W} height={38} rx={10} />
            <text x={NODE_W / 2} y={24} textAnchor="middle">
              {getIndicator(id).name}
            </text>
          </g>
        ))}

        {graph.primitives.map((pid, i) => (
          <g
            key={pid}
            transform={`translate(${primX}, ${primY(i)})`}
            className={`graph-node primitive ${usedPrimitives.has(pid) ? "" : "unused"} ${isDim(`p:${pid}`) ? "dim" : ""} ${selected === `p:${pid}` ? "selected" : ""}`}
            onClick={() => setSelected(selected === `p:${pid}` ? null : `p:${pid}`)}
          >
            <rect width={NODE_W} height={38} rx={10} />
            <text x={NODE_W / 2} y={24} textAnchor="middle">
              {PRIMITIVE_INFO[pid].name}
            </text>
          </g>
        ))}
      </svg>
      <div className="graph-detail">
        {selectedInfo ?? "Seven classic indicators, eight primitives — and most of the work is done by just a few of them. That's the whole secret of technical analysis libraries."}
      </div>
    </div>
  );
}
