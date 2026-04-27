// Heap implementation in JavaScript
class heap {
  constructor(type = "max") {
    this.heap = [];
    this.type = type;
  }

  insert(val) {
    this.heap.push(val);
    this.bubbleUp(this.heap.length - 1);
  }

  bubbleUp(index) {
    const parentIndex = Math.floor((index - 1) / 2);
    if (this.type === "max") {
      if (this.heap[index] > this.heap[parentIndex]) {
        [this.heap[index], this.heap[parentIndex]] = [
          this.heap[parentIndex],
          this.heap[index],
        ];
        this.bubbleUp(parentIndex);
      }
    } else {
      if (this.heap[index] < this.heap[parentIndex]) {
        [this.heap[index], this.heap[parentIndex]] = [
          this.heap[parentIndex],
          this.heap[index],
        ];
        this.bubbleUp(parentIndex);
      }
    }
  }

  extract() {
    if (this.type === "max") {
      return this.extractMax();
    } else {
      return this.extractMin();
    }
  }

  extractMax() {
    if (this.heap.length === 0) return null;
    const root = this.heap[0];
    const end = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = end;
      this.sinkDown(0);
    }
    return root;
  }

  extractMin() {
    if (this.heap.length === 0) return null;
    const root = this.heap[0];
    const end = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = end;
      this.sinkDown(0);
    }
    return root;
  }

  sinkDown(index) {
    const leftChildIndex = 2 * index + 1;
    const rightChildIndex = 2 * index + 2;
    let root = index;

    if (
      leftChildIndex < this.heap.length &&
      (this.type === "min"
        ? this.heap[leftChildIndex] < this.heap[root]
        : this.heap[leftChildIndex] > this.heap[root])
    ) {
      root = leftChildIndex;
    }
    if (
      rightChildIndex < this.heap.length &&
      (this.type === "min"
        ? this.heap[rightChildIndex] < this.heap[root]
        : this.heap[rightChildIndex] > this.heap[root])
    ) {
      root = rightChildIndex;
    }
    if (root !== index) {
      [this.heap[index], this.heap[root]] = [this.heap[root], this.heap[index]];
      this.sinkDown(root);
    }
  }
}

// Example usage:
const maxHeap = new heap("max");
const minHeap = new heap("min");
maxHeap.insert(10);
maxHeap.insert(20);
maxHeap.insert(5);
console.log(maxHeap.extractMax()); // 20
console.log(maxHeap.extractMax()); // 10
console.log(maxHeap.extractMax()); // 5
console.log(maxHeap.extractMax()); // null
minHeap.insert(10);
minHeap.insert(20);
minHeap.insert(5);
console.log(minHeap.extractMin()); // 5
console.log(minHeap.extractMin()); // 10
console.log(minHeap.extractMin()); // 20
console.log(minHeap.extractMin()); // null
