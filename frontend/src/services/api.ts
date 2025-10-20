import axios from 'axios';
const baseURL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3333';
export const api = axios.create({ baseURL });

export async function getCapabilities(){ return (await api.get('/auth/capabilities')).data; }
export async function getEvents(classId:string){ return (await api.get(`/classes/${classId}/events`)).data; }
export async function createEvent(body:{classId:string;type:string;title:string;description?:string;start:string;end:string}){ return (await api.post(`/events`, body)).data; }
export async function deleteEvent(id:string){ return (await api.delete(`/events/${id}`)).data; }
export async function getMessages(classId:string){ return (await api.get(`/classes/${classId}/messages`)).data; }
export async function sendMessage(payload:{classId:string;text:string}){ return (await api.post(`/messages`,payload)).data; }
export async function registerDevice(payload:{expoPushToken:string; classId:string}){ return (await api.post('/devices/register', payload)).data; }
export async function uploadInvites(csvText:string){ return (await api.post('/admin/invitations', { csvText })).data; }
export async function sendTestPush(payload:{ classId:string; title:string; body:string }){ return (await api.post('/admin/test-push', payload)).data; }