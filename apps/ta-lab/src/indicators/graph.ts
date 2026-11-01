/**
 * Derives the indicator → primitive graph from the implementations themselves.
 * Each indicator's `compute` is run once on a small synthetic dataset with a
 * recording wrapper around the primitives toolkit; an edge exists iff the
 * indicator actually called that primitive. Nothing is hand-declared.
 */

import { generateCandles } from "../data/synthetic.ts";
import { INDICATORS } from "./indicators.ts";
import { PRIMITIVE_IDS, primitives, type PrimitiveId, type Primitives } from "./primitives.ts";

export interface GraphEdge {
  indicator: string;
  primitive: PrimitiveId;
}

export interface PrimitivesGraph {
  indicators: string[];
  primitives: PrimitiveId[];
  edges: GraphEdge[];
}

function recordingToolkit(calls: Set<PrimitiveId>): Primitives {
  const kit = {} as Record<PrimitiveId, unknown>;
  for (const id of PRIMITIVE_IDS) {
    const real = primitives[id] as (...args: unknown[]) => unknown;
    kit[id] = (...args: unknown[]) => {
      calls.add(id);
      return real(...args);
    };
  }
  return kit as unknown as Primitives;
}

export function derivePrimitivesGraph(): PrimitivesGraph {
  const sample = generateCandles("NEONX", 1234, 120);
  const edges: GraphEdge[] = [];
  for (const def of INDICATORS) {
    const calls = new Set<PrimitiveId>();
    def.compute(sample, def.defaults, recordingToolkit(calls));
    for (const p of PRIMITIVE_IDS) {
      if (calls.has(p)) edges.push({ indicator: def.id, primitive: p });
    }
  }
  return {
    indicators: INDICATORS.map((d) => d.id),
    primitives: [...PRIMITIVE_IDS],
    edges,
  };
}
