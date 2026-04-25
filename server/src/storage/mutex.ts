import { Mutex } from 'async-mutex'

// Singleton mutex — the ONLY Mutex instance in the entire server.
// DO NOT create another Mutex elsewhere in the codebase.
// Each Mutex instance has its own independent queue; multiple instances provide zero mutual exclusion.
export const dbMutex = new Mutex()
