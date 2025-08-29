// src/middleware/audit.ts
import fs from 'fs';
import { env } from '../config/env.js';

export function audit(action: string, detail: any){
  try{
    if (!env.auditToFile) return;
    const line = JSON.stringify({ at: new Date().toISOString(), action, detail }) + '\n';
    fs.appendFileSync(env.auditFilePath, line);
  }catch (_e){}
}