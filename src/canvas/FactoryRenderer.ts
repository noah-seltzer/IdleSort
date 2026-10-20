import { Container, Graphics, Text, type Application, type FederatedPointerEvent } from 'pixi.js';
import type { GameSession } from '../game/session';
import type { NodeView, PortDirection, PortRef, Snapshot } from '../sim';
import { CELL_SIZE, NODE_SIZE, PORT_RADIUS, cellCentre, distanceToSegment, portPosition, type Point } from './layout';

const COLORS = {
  grid: 0x2a2e36,
  producer: 0x2e7d5b,
  receiver: 0x8a5a2b,
  nodeBorder: 0xe6e8eb,
  port: 0xe6e8eb,
  connection: 0x5b6472,
  connectionHover: 0xe06c5a,
  drag: 0xa0c4ff,
  label: 0xffffff,
};

const NODE_LABELS: Record<NodeView['type'], string> = { producer: 'Producer', receiver: 'Receiver' };
const PORT_HIT_RADIUS = PORT_RADIUS + 8;
const CONNECTION_HIT_DISTANCE = 8;
const GRID_EXTENT = 60;

interface PortHit extends PortRef {
  direction: PortDirection;
}

/**
 * Draws the factory from session snapshots and turns pointer input into
 * session commands. Reads only; it never changes game state directly.
 */
export class FactoryRenderer {
  private readonly world = new Container();
  private readonly grid = new Graphics();
  private readonly connections = new Graphics();
  private readonly nodes = new Container();
  private readonly batches = new Container();
  private readonly dragLine = new Graphics();
  private readonly batchSprites = new Map<string, Container>();
  private nodesKey = '';
  private drag: { from: PortHit; pointer: Point } | null = null;
  private hoveredConnection: string | null = null;
  private pressedConnection: string | null = null;

  constructor(
    private readonly app: Application,
    private readonly session: GameSession,
  ) {
    this.world.addChild(this.grid, this.connections, this.nodes, this.batches, this.dragLine);
    app.stage.addChild(this.world);
    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    app.stage.on('pointerdown', this.onPointerDown);
    app.stage.on('pointermove', this.onPointerMove);
    app.stage.on('pointerup', this.onPointerUp);
    app.stage.on('pointerupoutside', this.onPointerUp);
    this.drawGrid();
    app.ticker.add(this.render);
  }

  destroy(): void {
    this.app.ticker.remove(this.render);
    this.app.stage.off('pointerdown', this.onPointerDown);
    this.app.stage.off('pointermove', this.onPointerMove);
    this.app.stage.off('pointerup', this.onPointerUp);
    this.app.stage.off('pointerupoutside', this.onPointerUp);
    this.world.destroy({ children: true });
  }

  private get snapshot(): Snapshot {
    return this.session.getView().snapshot;
  }

  private render = (): void => {
    const snapshot = this.snapshot;
    this.centreWorld(snapshot);
    this.syncNodes(snapshot);
    this.drawConnections(snapshot);
    this.drawBatches(snapshot);
    this.drawDragLine();
  };

  /** Keeps the factory centred until pan and zoom arrive. */
  private centreWorld(snapshot: Snapshot): void {
    const centres = snapshot.nodes.map((n) => cellCentre(n.cell));
    if (centres.length === 0) return;
    const xs = centres.map((c) => c.x);
    const ys = centres.map((c) => c.y);
    const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
    this.world.position.set(Math.round(this.app.screen.width / 2 - midX), Math.round(this.app.screen.height / 2 - midY));
  }

  private drawGrid(): void {
    const min = -GRID_EXTENT * CELL_SIZE;
    const max = GRID_EXTENT * CELL_SIZE;
    for (let i = -GRID_EXTENT; i <= GRID_EXTENT; i++) {
      const at = i * CELL_SIZE;
      this.grid.moveTo(at, min).lineTo(at, max);
      this.grid.moveTo(min, at).lineTo(max, at);
    }
    this.grid.stroke({ width: 1, color: COLORS.grid });
  }

  /** Nodes rarely change, so rebuild their graphics only when the set does. */
  private syncNodes(snapshot: Snapshot): void {
    const key = snapshot.nodes.map((n) => `${n.id}@${n.cell.x},${n.cell.y}`).join('|');
    if (key === this.nodesKey) return;
    this.nodesKey = key;
    for (const child of this.nodes.removeChildren()) child.destroy({ children: true });

    for (const node of snapshot.nodes) {
      const centre = cellCentre(node.cell);
      const box = new Graphics()
        .roundRect(centre.x - NODE_SIZE / 2, centre.y - NODE_SIZE / 2, NODE_SIZE, NODE_SIZE, 10)
        .fill(COLORS[node.type])
        .stroke({ width: 2, color: COLORS.nodeBorder, alpha: 0.6 });
      for (const port of node.ports) {
        const at = portPosition(node, port);
        box.circle(at.x, at.y, PORT_RADIUS).fill(COLORS.port).stroke({ width: 2, color: COLORS[node.type] });
      }
      const label = new Text({ text: NODE_LABELS[node.type], style: { fill: COLORS.label, fontSize: 11, fontWeight: '600' } });
      label.anchor.set(0.5);
      label.position.set(centre.x, centre.y);
      this.nodes.addChild(box, label);
    }
  }

  private drawConnections(snapshot: Snapshot): void {
    this.connections.clear();
    for (const connection of snapshot.connections) {
      const [from, to] = this.connectionEnds(snapshot, connection.from, connection.to);
      const hovered = connection.id === this.hoveredConnection && !this.drag;
      this.connections
        .moveTo(from.x, from.y)
        .lineTo(to.x, to.y)
        .stroke({ width: hovered ? 6 : 4, color: hovered ? COLORS.connectionHover : COLORS.connection });
    }
  }

  /** Batch positions are interpolated between ticks using the session's alpha. */
  private drawBatches(snapshot: Snapshot): void {
    const seen = new Set<string>();
    const alpha = this.session.alpha;
    for (const connection of snapshot.connections) {
      const [from, to] = this.connectionEnds(snapshot, connection.from, connection.to);
      for (const batch of connection.batches) {
        seen.add(batch.id);
        const progress = Math.min(1, batch.progress + alpha / connection.travelTicks);
        const sprite = this.batchSprites.get(batch.id) ?? this.createBatchSprite(batch.id, batch.items);
        sprite.position.set(from.x + (to.x - from.x) * progress, from.y + (to.y - from.y) * progress);
      }
    }
    for (const [id, sprite] of this.batchSprites) {
      if (seen.has(id)) continue;
      sprite.destroy({ children: true });
      this.batchSprites.delete(id);
    }
  }

  private createBatchSprite(id: string, items: readonly number[]): Container {
    const sprite = new Container();
    const first = items[0] ?? 0;
    const background = new Graphics().roundRect(-13, -11, 26, 22, 6).fill(itemColor(first));
    const label = new Text({
      text: items.length === 1 ? String(first) : `×${items.length}`,
      style: { fill: 0x111111, fontSize: 11, fontWeight: '700' },
    });
    label.anchor.set(0.5);
    sprite.addChild(background, label);
    this.batches.addChild(sprite);
    this.batchSprites.set(id, sprite);
    return sprite;
  }

  private drawDragLine(): void {
    this.dragLine.clear();
    if (!this.drag) return;
    const start = this.portPoint(this.snapshot, this.drag.from);
    if (!start) return;
    this.dragLine
      .moveTo(start.x, start.y)
      .lineTo(this.drag.pointer.x, this.drag.pointer.y)
      .stroke({ width: 3, color: COLORS.drag, alpha: 0.8 });
  }

  // ---- Input ----

  private onPointerDown = (event: FederatedPointerEvent): void => {
    const point = this.world.toLocal(event.global);
    const port = this.portAt(point);
    if (port) {
      this.drag = { from: port, pointer: point };
      return;
    }
    this.pressedConnection = this.connectionAt(point);
  };

  private onPointerMove = (event: FederatedPointerEvent): void => {
    const point = this.world.toLocal(event.global);
    if (this.drag) {
      this.drag.pointer = point;
      this.setCursor('crosshair');
      return;
    }
    const overPort = this.portAt(point) !== null;
    this.hoveredConnection = overPort ? null : this.connectionAt(point);
    this.setCursor(overPort ? 'crosshair' : this.hoveredConnection ? 'pointer' : 'default');
  };

  private onPointerUp = (event: FederatedPointerEvent): void => {
    const point = this.world.toLocal(event.global);
    if (this.drag) {
      const from = this.drag.from;
      const target = this.portAt(point);
      this.drag = null;
      if (target && !(target.nodeId === from.nodeId && target.portId === from.portId)) {
        // Dragging backwards from an input to an output is the same intent.
        const reversed = from.direction === 'in' && target.direction === 'out';
        const [start, end] = reversed ? [target, from] : [from, target];
        this.session.connect(toRef(start), toRef(end));
      }
      return;
    }
    const pressed = this.pressedConnection;
    this.pressedConnection = null;
    if (pressed && pressed === this.connectionAt(point)) {
      this.session.disconnect(pressed);
      this.hoveredConnection = null;
    }
  };

  private setCursor(cursor: string): void {
    this.app.canvas.style.cursor = cursor;
  }

  // ---- Hit testing ----

  private portAt(point: Point): PortHit | null {
    for (const node of this.snapshot.nodes) {
      for (const port of node.ports) {
        const at = portPosition(node, port);
        if (Math.hypot(point.x - at.x, point.y - at.y) <= PORT_HIT_RADIUS) {
          return { nodeId: node.id, portId: port.id, direction: port.direction };
        }
      }
    }
    return null;
  }

  private connectionAt(point: Point): string | null {
    const snapshot = this.snapshot;
    for (const connection of snapshot.connections) {
      const [from, to] = this.connectionEnds(snapshot, connection.from, connection.to);
      if (distanceToSegment(point, from, to) <= CONNECTION_HIT_DISTANCE) return connection.id;
    }
    return null;
  }

  private connectionEnds(snapshot: Snapshot, from: PortRef, to: PortRef): [Point, Point] {
    return [this.portPoint(snapshot, from) ?? { x: 0, y: 0 }, this.portPoint(snapshot, to) ?? { x: 0, y: 0 }];
  }

  private portPoint(snapshot: Snapshot, ref: PortRef): Point | null {
    const node = snapshot.nodes.find((n) => n.id === ref.nodeId);
    const port = node?.ports.find((p) => p.id === ref.portId);
    return node && port ? portPosition(node, port) : null;
  }
}

function toRef(port: PortHit): PortRef {
  return { nodeId: port.nodeId, portId: port.portId };
}

/** Low values are cool blue, high values warm orange, so order is visible at a glance. */
function itemColor(value: number): number {
  const t = Math.max(0, Math.min(1, (value - 1) / 99));
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  return (lerp(0x6c, 0xff) << 16) | (lerp(0xb4, 0xa0) << 8) | lerp(0xff, 0x4a);
}
