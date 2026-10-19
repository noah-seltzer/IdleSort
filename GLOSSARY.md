# IdleSort

An incremental factory game: the player wires Nodes into a graph that carries Items from Producers to a Receiver, earning money for delivering Items in sorted order.

## Flow

**Item**:
A single piece of data flowing through the factory, e.g. one number.
_Avoid_: Number (as the general term), datum, packet, token

**Data Type**:
The kind of an Item: Number at first, later Character and String.
_Avoid_: Item type, kind

**Batch**:
An ordered group of one or more Items; the only unit that travels along a Connection.
_Avoid_: Group, chunk, packet

## Nodes

**Node**:
A placeable building in the factory that receives and/or emits Batches through its Ports.
_Avoid_: Machine, building, block

**Port**:
An input or output attachment point on a Node where a Connection begins or ends.
_Avoid_: Socket, pin, slot

**Connection**:
A directed link from an output Port to an input Port, along which Batches visibly travel.
_Avoid_: Wire, belt, edge, link

**Producer**:
A Node that creates new Items and emits each as a Batch of size 1.
_Avoid_: Generator, source, spawner

**Buffer**:
A Node that merges incoming Batches until it reaches capacity, then emits them as one Batch.
_Avoid_: Queue, collector, accumulator

**Sorter**:
A Node that reorders the Items within a Batch using its current Sorting Algorithm.
_Avoid_: Sorting machine

**Merger**:
A Node with several input Ports and one output Port that combines incoming Batches into a single stream.
_Avoid_: Combiner, joiner, funnel

**Slot**:
A Sorter's capacity to work on one Batch at a time; Sorters start with one Slot and can gain more.
_Avoid_: Lane, thread, channel

**Backpressure**:
The stalling of upstream Nodes when a downstream Connection or Node has no room for another Batch.
_Avoid_: Blocking, jam, overflow

**Receiver**:
A Node that consumes Batches and pays money for each Item it scores.
_Avoid_: Sink, consumer, output, collector

## Scoring & sorting

**Run**:
An unbroken ascending sequence of Items arriving at the Receiver; each Item's payout grows with the current Run length.
_Avoid_: Streak, combo, chain

**Sorting Algorithm**:
The method a Sorter uses (e.g. bubble sort, merge sort); its cost is the real number of Operations it performs on the actual Batch.
_Avoid_: Sort mode, strategy

**Operation**:
One comparison or swap performed by a Sorting Algorithm; a Sorter's speed is measured in Operations per second.
_Avoid_: Step, tick

## Progression

**Money**:
The single currency, earned at the Receiver and spent on Nodes, Upgrades and space.
_Avoid_: Cash, credits, coins, score

**Upgrade**:
A permanent purchase that improves a stat for every Node of one type, e.g. maximum Buffer capacity.
_Avoid_: Research, tech, level-up

**Setting**:
A per-Node choice made within the limits Upgrades allow, e.g. one Buffer's capacity or one Sorter's Sorting Algorithm.
_Avoid_: Config, option, mode

**Milestone**:
An achievement that unlocks new Nodes, Upgrades or shop sections when reached.
_Avoid_: Achievement, goal, unlock condition
