import React,{useState,useEffect} from 'react';
import {View,Text,TextInput,TouchableOpacity,StyleSheet} from 'react-native';
import {requestMagicLink,verifyMagicToken} from '../services/auth';
import { getCapabilities } from '../services/api';
export default function LoginScreen({navigation}:any){
  const [email,setEmail]=useState('');
  const [classCode,setClassCode]=useState('3A');
  const [token,setToken]=useState('');
  const [stage,setStage]=useState<'req'|'ver'>('req');
  const [caps,setCaps]=useState({bankid:false,magic:true});
  useEffect(()=>{(async()=>{try{setCaps(await getCapabilities());}catch{}})();},[]);
  return(<View style={styles.c}>
    <Text style={styles.t}>SkolApp</Text>
    {stage==='req'?<>
      <Text style={styles.l}>E‑post</Text><TextInput value={email} onChangeText={setEmail} placeholder="namn@example.com" placeholderTextColor="#6b7280" style={styles.i}/>
      <Text style={styles.l}>Klasskod</Text><TextInput value={classCode} onChangeText={setClassCode} placeholder="t.ex. 3A" placeholderTextColor="#6b7280" style={styles.i}/>
      <TouchableOpacity style={styles.b} onPress={async()=>{await requestMagicLink(email,classCode); setStage('ver'); alert('Token loggas i backend (MVP).');}}><Text style={styles.bt}>Skicka magic link</Text></TouchableOpacity>
      <TouchableOpacity style={[styles.b, !caps.bankid?styles.disabled:null]} disabled={!caps.bankid} onPress={()=>alert('BankID är inte aktiverat i denna miljö.')}>
        <Text style={styles.bt}>Logga in med BankID (förberett)</Text>
      </TouchableOpacity>
    </> : <>
      <Text style={styles.l}>Klistra in token (MVP)</Text><TextInput value={token} onChangeText={setToken} placeholder="token" placeholderTextColor="#6b7280" style={styles.i}/>
      <TouchableOpacity style={styles.b} onPress={async()=>{await verifyMagicToken(token); navigation.replace('Tabs');}}><Text style={styles.bt}>Verifiera & logga in</Text></TouchableOpacity>
    </>}
  </View>);
}
const styles=StyleSheet.create({
  c:{flex:1,justifyContent:'center',padding:24,backgroundColor:'#0b1220'},
  t:{color:'white',fontSize:28,fontWeight:'800',marginBottom:16,textAlign:'center'},
  l:{color:'#9ca3af',marginTop:8},
  i:{backgroundColor:'#111827',color:'white',width:'100%',borderRadius:12,padding:12,borderWidth:1,borderColor:'#374151',marginTop:6},
  b:{backgroundColor:'#3b82f6',padding:14,borderRadius:12,width:'100%',alignItems:'center',marginTop:12},
  bt:{color:'white',fontWeight:'700'},
  disabled:{backgroundColor:'#1f2937'}
});