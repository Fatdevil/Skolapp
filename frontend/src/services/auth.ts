import { api } from './api';
export async function requestMagicLink(email:string,classCode:string){ return (await api.post('/auth/magic/initiate',{email,classCode})).data; }
export async function verifyMagicToken(token:string){ return (await api.post('/auth/magic/verify',{token})).data; }