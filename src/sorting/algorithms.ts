/**
 * Sorting Algorithms (ADR-0003): pure functions that sort a Batch's Items and
 * record every Operation they perform. A Sorter's time per Batch is the
 * Operation count divided by its Operations per second, and the recorded
 * steps drive the bar-swap animation.
 */

/** One Operation, by array index. Comparisons read; swaps and writes change the array. */
export type Operation =
  | { type: 'compare'; i: number; j: number }
  | { type: 'swap'; i: number; j: number }
  | { type: 'write'; index: number; value: number };

export interface SortResult {
  sorted: number[];
  operations: Operation[];
  /** Total Operations performed; always equals `operations.length`. */
  count: number;
}

export type SortingAlgorithmId = 'bubble' | 'insertion' | 'shell' | 'merge' | 'quick' | 'heap' | 'radix';

export interface SortingAlgorithm {
  id: SortingAlgorithmId;
  name: string;
  sort(items: readonly number[]): SortResult;
}

/** Applies recorded Operations to a copy of `items`, reproducing the sort. */
export function replay(items: readonly number[], operations: readonly Operation[]): number[] {
  const a = [...items];
  for (const op of operations) {
    if (op.type === 'swap') [a[op.i], a[op.j]] = [a[op.j]!, a[op.i]!];
    else if (op.type === 'write') a[op.index] = op.value;
  }
  return a;
}

/** A working copy of the Items that records each Operation performed on it. */
class Tracked {
  readonly a: number[];
  readonly operations: Operation[] = [];

  constructor(items: readonly number[]) {
    this.a = [...items];
  }

  get length(): number {
    return this.a.length;
  }

  /** Records a comparison and returns whether a[i] > a[j]. */
  greater(i: number, j: number): boolean {
    this.operations.push({ type: 'compare', i, j });
    return this.a[i]! > this.a[j]!;
  }

  swap(i: number, j: number): void {
    this.operations.push({ type: 'swap', i, j });
    [this.a[i], this.a[j]] = [this.a[j]!, this.a[i]!];
  }

  write(index: number, value: number): void {
    this.operations.push({ type: 'write', index, value });
    this.a[index] = value;
  }

  result(): SortResult {
    return { sorted: this.a, operations: this.operations, count: this.operations.length };
  }
}

function run(items: readonly number[], body: (t: Tracked) => void): SortResult {
  const tracked = new Tracked(items);
  body(tracked);
  return tracked.result();
}

/** Repeated adjacent swaps; stops early once a pass makes no swaps. */
function bubble(items: readonly number[]): SortResult {
  return run(items, (t) => {
    for (let end = t.length - 1; end > 0; end--) {
      let swapped = false;
      for (let i = 0; i < end; i++) {
        if (t.greater(i, i + 1)) {
          t.swap(i, i + 1);
          swapped = true;
        }
      }
      if (!swapped) break;
    }
  });
}

/** Swaps each Item back until it is in place; cheap on nearly sorted Batches. */
function insertion(items: readonly number[]): SortResult {
  return run(items, (t) => gappedInsertion(t, 1));
}

function gappedInsertion(t: Tracked, gap: number): void {
  for (let i = gap; i < t.length; i++) {
    for (let j = i; j >= gap && t.greater(j - gap, j); j -= gap) t.swap(j - gap, j);
  }
}

/** Insertion sort over shrinking gaps (Knuth's sequence 1, 4, 13, 40, ...). */
function shell(items: readonly number[]): SortResult {
  return run(items, (t) => {
    let gap = 1;
    while (gap < t.length / 3) gap = gap * 3 + 1;
    for (; gap >= 1; gap = (gap - 1) / 3) gappedInsertion(t, gap);
  });
}

/** Top-down merge sort, writing merged runs back into the array. */
function merge(items: readonly number[]): SortResult {
  return run(items, (t) => {
    const sortRange = (lo: number, hi: number): void => {
      if (hi - lo < 1) return;
      const mid = Math.floor((lo + hi) / 2);
      sortRange(lo, mid);
      sortRange(mid + 1, hi);
      const left = t.a.slice(lo, mid + 1);
      const right = t.a.slice(mid + 1, hi + 1);
      let l = 0;
      let r = 0;
      for (let k = lo; k <= hi; k++) {
        // Compare the two candidates at their original positions in this range.
        const takeRight = l >= left.length || (r < right.length && compareValues(t, lo + l, mid + 1 + r, left[l]!, right[r]!));
        t.write(k, takeRight ? right[r++]! : left[l++]!);
      }
    };
    sortRange(0, t.length - 1);
  });
}

/** Records a comparison of two values held outside the array; true if a > b. */
function compareValues(t: Tracked, i: number, j: number, a: number, b: number): boolean {
  t.operations.push({ type: 'compare', i, j });
  return a > b;
}

/** Quick sort with a deterministic middle pivot and Lomuto partitioning. */
function quick(items: readonly number[]): SortResult {
  return run(items, (t) => {
    const sortRange = (lo: number, hi: number): void => {
      if (lo >= hi) return;
      const mid = Math.floor((lo + hi) / 2);
      if (mid !== hi) t.swap(mid, hi);
      let store = lo;
      for (let i = lo; i < hi; i++) {
        if (!t.greater(i, hi)) {
          if (i !== store) t.swap(i, store);
          store++;
        }
      }
      if (store !== hi) t.swap(store, hi);
      sortRange(lo, store - 1);
      sortRange(store + 1, hi);
    };
    sortRange(0, t.length - 1);
  });
}

/** Builds a max-heap, then repeatedly moves the largest Item to the end. */
function heap(items: readonly number[]): SortResult {
  return run(items, (t) => {
    const siftDown = (root: number, size: number): void => {
      for (;;) {
        const left = 2 * root + 1;
        if (left >= size) return;
        let largest = root;
        if (t.greater(left, largest)) largest = left;
        const right = left + 1;
        if (right < size && t.greater(right, largest)) largest = right;
        if (largest === root) return;
        t.swap(root, largest);
        root = largest;
      }
    };
    for (let i = Math.floor(t.length / 2) - 1; i >= 0; i--) siftDown(i, t.length);
    for (let end = t.length - 1; end > 0; end--) {
      t.swap(0, end);
      siftDown(0, end);
    }
  });
}

/**
 * LSD radix sort in base 10. It never compares Items; each digit pass writes
 * every Item into its new position, and those writes are its Operations.
 * Assumes non-negative integers, which is all Producers emit.
 */
function radix(items: readonly number[]): SortResult {
  return run(items, (t) => {
    const max = Math.max(0, ...t.a);
    for (let place = 1; max >= place; place *= 10) {
      const buckets: number[][] = Array.from({ length: 10 }, () => []);
      for (const value of t.a) buckets[Math.floor(value / place) % 10]!.push(value);
      buckets.flat().forEach((value, index) => t.write(index, value));
    }
  });
}

/** Every Sorting Algorithm, in the order the player unlocks them. */
export const SORTING_ALGORITHMS: readonly SortingAlgorithm[] = [
  { id: 'bubble', name: 'Bubble sort', sort: bubble },
  { id: 'insertion', name: 'Insertion sort', sort: insertion },
  { id: 'shell', name: 'Shell sort', sort: shell },
  { id: 'merge', name: 'Merge sort', sort: merge },
  { id: 'quick', name: 'Quick sort', sort: quick },
  { id: 'heap', name: 'Heap sort', sort: heap },
  { id: 'radix', name: 'Radix sort', sort: radix },
];

export function sortingAlgorithm(id: SortingAlgorithmId): SortingAlgorithm {
  const algorithm = SORTING_ALGORITHMS.find((a) => a.id === id);
  if (!algorithm) throw new Error(`Unknown Sorting Algorithm ${id}`);
  return algorithm;
}
