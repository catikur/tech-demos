import { useMemo, useState } from "react";
import { derivePrimitivesGraph } from "../indicators/graph.ts";
import { getIndicator, MODULES } from "../indicators/indicators.ts";
import { PRIMITIVE_INFO, type PrimitiveId } from "../indicators/primitives.ts";

const WIDTH = 940;
const NODE_W = 168;
const NODE_H = 26;
const ROW_H = 31;
const MODULE_GAP = 14;
const PAD_TOP = 34;

export function PrimitivesGraph() {
  const graph = useMemo(() => derivePrimitivesGraph(), []);
  const [selected, setSelected] = useState<string | null>(null);

  // Indicator rows grouped by module (INDICATORS registry is module-ordered).
  const layout = useMemo(() => {
    const indY = new Map<string, number>();
    let y = PAD_TOP;
    let prevModule: string | null = null;
    const moduleLabels: { y: number; name: string; color: string }[] = [];
    for (const id of graph.indicators) {
      const def = getIndicator(id);
      if (def.module !== prevModule) {
        if (prevModule !== null) y += MODULE_GAP;
        const mod = MODULES.find((m) => m.id === def.module)!;
        moduleLabels.push({ y, name: mod.name, color: mod.color });
        prevModule = def.module;
      }
      indY.set(id, y);
      y += ROW_H;
    }
    const totalH = y + 10;
    const primY = new Map<PrimitiveId, number>();
    const span = totalH - PAD_TOP - NODE_H;
    graph.primitives.forEach((pid, i) => {
      primY.set(pid, PAD_TOP + (span * i) / Math.max(1, graph.primitives.length - 1));
    });
    return { indY, primY, totalH, moduleLabels };
  }, [graph]);

  const indX = 118;
  const primX = WIDTH - NODE_W - 24;

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

  const moduleColor = (id: string) => MODULES.find((m) => m.id === getIndicator(id).module)!.color;

  const selectedInfo = (() => {
    if (!selected) return null;
    if (selected.startsWith("i:")) {
      const def = getIndicator(selected.slice(2));
      const prims = graph.edges
        .filter((e) => e.indicator === def.id)
        .map((e) => PRIMITIVE_INFO[e.primitive].name);
      return `${def.name} is built from: ${prims.join(" + ")}.`;
    }
    const pid = selected.slice(2) as PrimitiveId;
    const users = graph.edges.filter((e) => e.primitive === pid).map((e) => getIndicator(e.indicator).name);
    const info = PRIMITIVE_INFO[pid];
    return `${info.name} (${info.desc}) — used by ${users.length} indicator${users.length === 1 ? "" : "s"}: ${users.join(", ")}.`;
  })();

  const primUsage = useMemo(() => {
    const counts = new Map<PrimitiveId, number>();
    for (const e of graph.edges) counts.set(e.primitive, (counts.get(e.primitive) ?? 0) + 1);
    return counts;
  }, [graph]);

  return (
    <div className="graph-wrap">
      <p className="graph-note">
        Derived from the implementations: all {graph.indicators.length} indicators compute through an
        instrumented primitives toolkit, and an edge exists only if the indicator{" "}
        <em>actually called</em> that primitive. {graph.primitives.length} shared primitives carry the
        entire curriculum. Click any node to trace its connections.
      </p>
      <svg
        viewBox={`0 0 ${WIDTH} ${layout.totalH}`}
        className="graph-svg"
        role="img"
        aria-label="Indicator to primitive dependency graph"
      >
        <text x={indX + NODE_W / 2} y={16} className="graph-col-label" textAnchor="middle">
          INDICATORS
        </text>
        <text x={primX + NODE_W / 2} y={16} className="graph-col-label" textAnchor="middle">
          SHARED PRIMITIVES
        </text>

        {layout.moduleLabels.map((m) => (
          <text
            key={m.name}
            x={indX - 10}
            y={m.y + NODE_H / 2 + 3}
            textAnchor="end"
            className="graph-module-label"
            fill={m.color}
          >
            {m.name}
          </text>
        ))}

        {graph.edges.map((e) => {
          const y1 = (layout.indY.get(e.indicator) ?? 0) + NODE_H / 2;
          const y2 = (layout.primY.get(e.primitive) ?? 0) + NODE_H / 2;
          const x1 = indX + NODE_W;
          const x2 = primX;
          const mx = (x1 + x2) / 2;
          const active = edgeActive(e.indicator, e.primitive);
          return (
            <path
              key={`${e.indicator}-${e.primitive}`}
              d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
              className={`graph-edge ${active ? "active" : "dim"}`}
              style={{ stroke: moduleColor(e.indicator) }}
            />
          );
        })}

        {graph.indicators.map((id) => (
          <g
            key={id}
            transform={`translate(${indX}, ${layout.indY.get(id)})`}
            className={`graph-node indicator ${isDim(`i:${id}`) ? "dim" : ""} ${selected === `i:${id}` ? "selected" : ""}`}
            onClick={() => setSelected(selected === `i:${id}` ? null : `i:${id}`)}
          >
            <rect width={NODE_W} height={NODE_H} rx={8} style={{ stroke: moduleColor(id) }} />
            <text x={NODE_W / 2} y={NODE_H / 2 + 4} textAnchor="middle">
              {getIndicator(id).name}
            </text>
          </g>
        ))}

        {graph.primitives.map((pid) => (
          <g
            key={pid}
            transform={`translate(${primX}, ${layout.primY.get(pid)})`}
            className={`graph-node primitive ${isDim(`p:${pid}`) ? "dim" : ""} ${selected === `p:${pid}` ? "selected" : ""}`}
            onClick={() => setSelected(selected === `p:${pid}` ? null : `p:${pid}`)}
          >
            <rect width={NODE_W} height={NODE_H} rx={8} />
            <text x={10} y={NODE_H / 2 + 4}>
              {PRIMITIVE_INFO[pid].name}
            </text>
            <text x={NODE_W - 10} y={NODE_H / 2 + 4} textAnchor="end" className="graph-count">
              ×{primUsage.get(pid) ?? 0}
            </text>
          </g>
        ))}
      </svg>
      <div className="graph-detail">
        {selectedInfo ??
          `${graph.indicators.length} classic indicators, ${graph.primitives.length} primitives — and a handful of them (SMA, EMA, RMA, true range, highest/lowest) carry almost everything. That's the whole secret of technical analysis libraries.`}
      </div>
    </div>
  );
}
