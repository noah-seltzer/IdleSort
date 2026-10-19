# Batch is the only unit of flow

Connections carry Batches (ordered groups of Items), never bare Items: Producers emit size-1 Batches, Buffers merge them, Sorters reorder within a Batch, and the Receiver unpacks and scores them. This makes "a Sorter is useless without a Buffer upstream" fall out of the model with no special cases, and keeps one shape for everything that travels. Don't "simplify" Connections to carry single Items: Sorters would then need hidden internal buffering and the core progression lesson disappears.
