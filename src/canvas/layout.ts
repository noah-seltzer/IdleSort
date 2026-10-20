import type { Cell, NodeView, PortInfo } from '../sim';

/** World-space geometry of the factory: where Nodes and Ports sit, in pixels. */
export const CELL_SIZE = 48;
export const NODE_SIZE = 72;
export const PORT_RADIUS = 9;

export interface Point {
  x: number;
  y: number;
}

export function cellCentre(cell: Cell): Point {
  return { x: (cell.x + 0.5) * CELL_SIZE, y: (cell.y + 0.5) * CELL_SIZE };
}

/** Inputs sit on a Node's left edge and outputs on its right, spread vertically. */
export function portPosition(node: NodeView, port: PortInfo): Point {
  const centre = cellCentre(node.cell);
  const sameSide = node.ports.filter((p) => p.direction === port.direction);
  const index = sameSide.findIndex((p) => p.id === port.id);
  const spacing = NODE_SIZE / (sameSide.length + 1);
  return {
    x: centre.x + (port.direction === 'in' ? -NODE_SIZE / 2 : NODE_SIZE / 2),
    y: centre.y - NODE_SIZE / 2 + spacing * (index + 1),
  };
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
