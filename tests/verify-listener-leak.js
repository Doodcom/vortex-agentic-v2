// Verification script for useOllama listener leak.
// This simulates the electron preload IPC bridge and the hook's mounting/unmounting.

import assert from 'node:assert';

let listeners = [];
const ipcRenderer = {
  on(channel, fn) {
    listeners.push({ channel, fn });
  },
  removeListener(channel, fn) {
    listeners = listeners.filter(l => !(l.channel === channel && l.fn === fn));
  },
  removeAllListeners(channel) {
    listeners = listeners.filter(l => l.channel !== channel);
  }
};

const bridge = {
  on(channel, callback) {
    const listener = (_, ...args) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  removeListener(channel, listener) {
    if (listener) ipcRenderer.removeListener(channel, listener);
    else ipcRenderer.removeAllListeners(channel);
  }
};

// 1. Simulate old behavior (removing all listeners by passing no callback)
console.log("--- Testing Old Behavior ---");
const oldHandleToken = (t) => {};
bridge.on('ollama-token', oldHandleToken);
console.log(`Before cleanup: ${listeners.length} listener(s)`);
assert.strictEqual(listeners.length, 1);

// Old cleanup called removeListener with no second argument
bridge.removeListener('ollama-token');
console.log(`After old cleanup: ${listeners.length} listener(s)`);
assert.strictEqual(listeners.length, 0);

// 2. Simulate new behavior (passing the callback)
console.log("\n--- Testing New Behavior (Type Safety Changes) ---");
const newHandleToken = (t) => {};
bridge.on('ollama-token', newHandleToken);
console.log(`Before cleanup: ${listeners.length} listener(s)`);
assert.strictEqual(listeners.length, 1);

// New cleanup calls removeListener with the callback
bridge.removeListener('ollama-token', newHandleToken);
console.log(`After new cleanup: ${listeners.length} listener(s)`);

if (listeners.length === 1) {
  console.log("\n❌ BUG CONFIRMED: The event listener was NOT removed and leaked!");
} else {
  console.log("\n✅ The event listener was removed successfully.");
}

process.exit(listeners.length === 1 ? 0 : 1);
