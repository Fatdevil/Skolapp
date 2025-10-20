export interface AuthProvider{initiateLogin(params:any):Promise<any>; verifyCallback(params:any):Promise<any>; linkBankId?(params:any):Promise<any>;}
