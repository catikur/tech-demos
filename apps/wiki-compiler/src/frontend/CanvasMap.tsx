import { useMemo, useRef, useState, type PointerEvent } from "react";
import { moveNode } from "../lib/canvas.ts";
import type { CanvasNode, JsonCanvas } from "../lib/types.ts";

const PRESET: Record<string, string> = {
  "1": "#af3029",
  "2": "#bc5215",
  "3": "#ad8301",
  "4": "#66800b",
  "5": "#24837b",
  "6": "#5e409d",
};

type Props = {
  canvas: JsonCanvas;
  onChange: (canvas: JsonCanvas) => void;
};

export function CanvasMap({ canvas, onChange }: Props) {
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const bounds = useMemo(() => {
    const maxX = Math.max(800, ...canvas.nodes.map((node) => node.x + node.width + 80));
    const maxY = Math.max(520, ...canvas.nodes.map((node) => node.y + node.height + 80));
    return { maxX, maxY };
  }, [canvas.nodes]);

  const nodeMap = useMemo(() => new Map(canvas.nodes.map((node) => [node.id, node])), [canvas.nodes]);

  function clientToSvg(event: PointerEvent<SVGRectElement>): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: event.clientX, y: event.clientY };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: event.clientX, y: event.clientY };
    const local = point.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }

  function onPointerDown(event: PointerEvent<SVGRectElement>, node: CanvasNode) {
    if (node.type === "group") return;
    const local = clientToSvg(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ id: node.id, dx: local.x - node.x, dy: local.y - node.y });
  }

  function onPointerMove(event: PointerEvent<SVGRectElement>) {
    if (!drag) return;
    const local = clientToSvg(event);
    onChange(moveNode(canvas, drag.id, local.x - drag.dx, local.y - drag.dy));
  }

  function onPointerUp() {
    setDrag(null);
  }

  return (
    <div className="canvas-wrap">
      <svg
        ref={svgRef}
        width={bounds.maxX}
        height={bounds.maxY}
        viewBox={`0 0 ${bounds.maxX} ${bounds.maxY}`}
      >
        {canvas.edges.map((edge) => {
          const from = nodeMap.get(edge.fromNode);
          const to = nodeMap.get(edge.toNode);
          if (!from || !to) return null;
          const x1 = from.x + from.width;
          const y1 = from.y + from.height / 2;
          const x2 = to.x;
          const y2 = to.y + to.height / 2;
          const mid = (x1 + x2) / 2;
          return (
            <path
              key={edge.id}
              d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke={PRESET[edge.color ?? "5"] ?? "#24837b"}
              strokeWidth="1.5"
              markerEnd="url(#arrow)"
            />
          );
        })}
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#24837b" />
          </marker>
        </defs>
        {canvas.nodes.map((node) => {
          const stroke = PRESET[node.color ?? ""] ?? undefined;
          const label = node.type === "file" ? node.file : node.type === "text" ? node.text : node.label ?? node.type;
          return (
            <g key={node.id}>
              <rect
                className={`node ${node.type}${drag?.id === node.id ? " dragging" : ""}`}
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rx={node.type === "group" ? 18 : 10}
                stroke={stroke}
                onPointerDown={(event) => onPointerDown(event, node)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              />
              <text className="node-label" x={node.x + 12} y={node.y + (node.type === "group" ? 22 : 28)}>
                {(label ?? node.id).slice(0, 42)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function exportCanvasFile(canvas: JsonCanvas): void {
  const blob = new Blob([`${JSON.stringify({ nodes: canvas.nodes, edges: canvas.edges }, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "knowledge-map.canvas";
  a.click();
  URL.revokeObjectURL(url);
}
