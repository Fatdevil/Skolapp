import type { AuthProvider } from './AuthProvider.js';
export const BankIdAuth: AuthProvider = {
  async initiateLogin({ personalNumber, device }: { personalNumber?: string; device: 'mobile'|'desktop' }){
    return { orderRef:'stub-order', status:'pending', device, hintCode:'OUTSTANDING_TRANSACTION' };
  },
  async verifyCallback({ orderRef }: { orderRef: string }){
    return { sessionToken:'stub-session-token', user:{ id:'user-stub', email:'stub@example.com', loa:'high' } };
  },
  async linkBankId(){ return { ok:true }; }
};