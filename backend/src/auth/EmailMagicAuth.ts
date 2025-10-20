import { v4 as uuid } from 'uuid';
import type { AuthProvider } from './AuthProvider.js';
export const EmailMagicAuth: AuthProvider = {
  async initiateLogin({ email, classCode }: { email: string; classCode: string }){
    const token = uuid();
    const magicLink = `skolapp://login?token=${token}`;
    return { token, magicLink };
  },
  async verifyCallback(){
    throw new Error('Use /auth/magic/verify');
  },
  async linkBankId(){ return { ok:false }; }
};