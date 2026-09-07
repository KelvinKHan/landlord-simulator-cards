export class UpdateStore {
  constructor(indexedDB = globalThis.indexedDB) { this.indexedDB = indexedDB; this.promise = null; }
  open() {
    return this.promise ||= new Promise((resolve,reject) => {
      const request = this.indexedDB.open('LandlordSimulatorUpdates', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('kv');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { this.promise = null; reject(request.error); };
    });
  }
  async get(key) {
    const db = await this.open();
    return new Promise((resolve,reject) => {
      const r = db.transaction('kv').objectStore('kv').get(key);
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
  }
  async set(key,value) {
    const db = await this.open();
    return new Promise((resolve,reject) => {
      const tx = db.transaction('kv','readwrite'); tx.objectStore('kv').put(value,key);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('存储已取消'));
    });
  }
}
