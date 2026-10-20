// @vitest-environment node
import { SORTING_ALGORITHMS, replay, sortingAlgorithm, type SortingAlgorithmId } from './index';

/** Deterministic pseudo-random Batch of Items in 1–100, for growth checks. */
function randomBatch(size: number, seed: number): number[] {
  let state = seed;
  return Array.from({ length: size }, () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return 1 + (state % 100);
  });
}

const SORTED_10 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const REVERSED_10 = [...SORTED_10].reverse();
const SHUFFLED_10 = [42, 7, 93, 18, 64, 3, 77, 29, 51, 86];

const CASES: Record<string, number[]> = {
  empty: [],
  single: [5],
  'all equal': [4, 4, 4, 4, 4, 4],
  'duplicate heavy': [3, 1, 3, 2, 1, 3, 2, 2, 1, 3],
  sorted: SORTED_10,
  reversed: REVERSED_10,
  shuffled: SHUFFLED_10,
  'random 100': randomBatch(100, 1),
  'includes 100': [100, 1, 50, 100, 9],
};

const ascending = (items: readonly number[]) => [...items].sort((a, b) => a - b);

describe.each(SORTING_ALGORITHMS)('$name', (algorithm) => {
  it.each(Object.entries(CASES))('sorts %s into an ascending permutation', (_, input) => {
    const result = algorithm.sort(input);
    expect(result.sorted).toEqual(ascending(input));
  });

  it.each(Object.entries(CASES))('replays its Operations on %s to the same result', (_, input) => {
    const result = algorithm.sort(input);
    expect(replay(input, result.operations)).toEqual(result.sorted);
    expect(result.operations).toHaveLength(result.count);
  });

  it('does not mutate its input', () => {
    const input = [...SHUFFLED_10];
    algorithm.sort(input);
    expect(input).toEqual(SHUFFLED_10);
  });

  it('is deterministic', () => {
    expect(algorithm.sort(SHUFFLED_10)).toEqual(algorithm.sort(SHUFFLED_10));
  });
});

describe('pinned Operation counts', () => {
  const counts = (input: number[]) =>
    Object.fromEntries(SORTING_ALGORITHMS.map((a) => [a.id, a.sort(input).count]));

  it('on an already sorted Batch of 10', () => {
    expect(counts(SORTED_10)).toMatchInlineSnapshot(`
      {
        "bubble": 9,
        "heap": 71,
        "insertion": 9,
        "merge": 53,
        "quick": 31,
        "radix": 20,
        "shell": 15,
      }
    `);
  });

  it('on a reversed Batch of 10', () => {
    expect(counts(REVERSED_10)).toMatchInlineSnapshot(`
      {
        "bubble": 90,
        "heap": 56,
        "insertion": 90,
        "merge": 49,
        "quick": 38,
        "radix": 20,
        "shell": 34,
      }
    `);
  });

  it('on a fixed shuffled Batch of 10', () => {
    expect(counts(SHUFFLED_10)).toMatchInlineSnapshot(`
      {
        "bubble": 57,
        "heap": 64,
        "insertion": 43,
        "merge": 59,
        "quick": 37,
        "radix": 20,
        "shell": 48,
      }
    `);
  });
});

describe('algorithmic character', () => {
  const count = (id: SortingAlgorithmId, input: number[]) => sortingAlgorithm(id).sort(input).count;

  it('makes Insertion sort cheap on a nearly sorted Batch', () => {
    const nearlySorted = Array.from({ length: 50 }, (_, i) => i + 1);
    [nearlySorted[10], nearlySorted[11]] = [nearlySorted[11]!, nearlySorted[10]!];
    [nearlySorted[30], nearlySorted[32]] = [nearlySorted[32]!, nearlySorted[30]!];
    const reversed = [...nearlySorted].sort((a, b) => b - a);

    expect(count('insertion', nearlySorted) * 10).toBeLessThan(count('insertion', reversed));
  });

  it('grows Bubble sort roughly quadratically and Merge sort roughly n log n', () => {
    const growth = (id: SortingAlgorithmId) => count(id, randomBatch(100, 7)) / count(id, randomBatch(10, 7));

    expect(growth('bubble')).toBeGreaterThan(50); // n² predicts ~100×
    expect(growth('merge')).toBeGreaterThan(10); // n log n predicts ~20×
    expect(growth('merge')).toBeLessThan(35);
  });

  it('ranks the late algorithms well below Bubble sort on a random Batch of 50', () => {
    const batch = randomBatch(50, 3);
    const bubble = count('bubble', batch);
    for (const id of ['shell', 'merge', 'quick', 'heap', 'radix'] as const) {
      expect(count(id, batch), id).toBeLessThan(bubble / 2);
    }
  });
});

describe('ladder', () => {
  it('lists the algorithms in unlock order with stable ids', () => {
    expect(SORTING_ALGORITHMS.map((a) => a.id)).toEqual(['bubble', 'insertion', 'shell', 'merge', 'quick', 'heap', 'radix']);
  });

  it('looks algorithms up by id', () => {
    expect(sortingAlgorithm('heap').name).toBe('Heap sort');
  });
});
