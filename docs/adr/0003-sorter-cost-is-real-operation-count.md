# Sorter cost is the real Operation count of its algorithm

A Sorter's time to sort a Batch is the actual number of comparisons and swaps its Sorting Algorithm performs on that specific Batch, divided by its Operations-per-second stat, rather than a flat per-Item or per-algorithm rate. This makes algorithm upgrades meaningful (bubble sort vs merge sort genuinely diverge as Buffers grow), creates the core tension between Batch size and sort time, and lets the node animate the real sort. The cost is that Sorters must actually execute (or step through) the algorithm inside the simulation.
