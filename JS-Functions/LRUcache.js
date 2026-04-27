// LRU cache
class Node {
  constructor(val) {
    this.value = val;
    this.next = null;
    this.prev = null;
  }
}

class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.map = new Map();
    this.head = new Node(-1);
    this.tail = new Node(-1);
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  get(key) {
    if (!this.map.has(key)) return -1;
    const node = this.map.get(key);
    this._remove(node);
    this._add(node);
    return node.value[1];
  }

  put(key, value) {
    if (this.map.has(key)) {
      const node = this.map.get(key);
      node.value[1] = value;
      this._remove(node);
      this._add(node);
      return;
    }
    if (this.map.size === this.capacity) {
      const lruNode = this.head.next;
      this._remove(lruNode);
      this.map.delete(lruNode.value[0]);
    }
    const newNode = new Node([key, value]);
    this._add(newNode);
    this.map.set(key, newNode);
  }

  _remove(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }

  _add(node) {
    node.prev = this.tail.prev;
    node.next = this.tail;
    this.tail.prev.next = node;
    this.tail.prev = node;
  }
}

// Example usage:
const cache = new LRUCache(2);
cache.put(1, 1);
cache.put(2, 2);
console.log(cache.get(1)); // returns 1
cache.put(3, 3); // evicts key 2
console.log(cache.get(2)); // returns -1 (not found)
cache.put(4, 4); // evicts key 1
console.log(cache.get(1)); // returns -1 (not found)
console.log(cache.get(4)); // returns 4
