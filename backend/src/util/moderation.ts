const banned=[/diagnos/i,/sjukhus/i,/personnummer/i,/allergi/i]; export function moderate(t:string){const hit=banned.find(r=>r.test(t)); return {flagged:!!hit,rule:hit?.toString()};}
