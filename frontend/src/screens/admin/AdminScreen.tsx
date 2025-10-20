import React,{useState} from 'react';
import {View,Text,StyleSheet,TextInput,TouchableOpacity,ScrollView} from 'react-native';
import { uploadInvites, sendTestPush } from '../../services/api';
import { useToast } from '../../components/ToastProvider';

export default function AdminScreen(){
  const toast = useToast();
  const [csv,setCsv]=useState('email,classCode\nanna@example.com,3A\n');
  const [preview,setPreview]=useState<string[][]>([]);
  const [validated,setValidated]=useState(false);
  const onPreview=()=>{
    try{
      const lines = csv.trim().split(/\r?\n/);
      const rows = lines.map(l=>l.split(',').map(s=>s.trim()));
      setPreview(rows);
      setValidated(rows.length>1 && rows[0][0].toLowerCase()==='email' && rows[0][1].toLowerCase()==='classcode');
    }catch{ setPreview([['Fel vid parsning']]); setValidated(false); }
  };
  const onUpload=async()=>{
    if(!validated){ toast.show('CSV saknar korrekta kolumnnamn (email,classCode)'); return; }
    try {
      const res=await uploadInvites(csv);
      toast.show(`Skickade ${res.count} inbjudningar`);
    } catch (error: any) {
      if (error?.response?.status === 403) {
        toast.show('Du saknar behörighet');
      } else {
        toast.show('Kunde inte skicka inbjudningar');
      }
    }
  };
  const onTestPush=async()=>{
    try {
      await sendTestPush({ classId:'class-1', title:'Testnotis', body:'Detta är en testnotis.'});
      toast.show('Testnotis skickad');
    } catch (error: any) {
      if (error?.response?.status === 403) {
        toast.show('Du saknar behörighet');
      } else {
        toast.show('Kunde inte skicka testnotis');
      }
    }
  };
  return(<ScrollView style={styles.c} contentContainerStyle={{padding:16}}>
    <Text style={styles.t}>Admin</Text>
    <Text style={styles.l}>CSV (email,classCode)</Text>
    <TextInput multiline value={csv} onChangeText={(t)=>{setCsv(t); setPreview([]); setValidated(false);}} style={styles.textarea} />
    <TouchableOpacity style={[styles.btn,styles.secondary]} onPress={onPreview}><Text style={styles.bt}>Förhandsgranskning</Text></TouchableOpacity>
    {preview.length>0 && <View style={{marginTop:8}}>
      {preview.slice(0,6).map((row,i)=>(<Text key={i} style={{color:'#9ca3af'}}>{row.join(' , ')}</Text>))}
      {!validated && <Text style={{color:'#ef4444',marginTop:4}}>Rubrik måste vara: email,classCode</Text>}
    </View>}
    <TouchableOpacity style={styles.btn} onPress={onUpload}><Text style={styles.bt}>Skicka inbjudningar</Text></TouchableOpacity>
    <TouchableOpacity style={[styles.btn,styles.secondary]} onPress={onTestPush}><Text style={styles.bt}>Skicka testnotis</Text></TouchableOpacity>
    <Text style={styles.hint}>Rollhantering styrs av backend under piloten.</Text>
  </ScrollView>);
}
const styles=StyleSheet.create({c:{flex:1,backgroundColor:'#0b1220'},t:{color:'white',fontSize:24,fontWeight:'800',marginBottom:12},l:{color:'#9ca3af',marginBottom:6},textarea:{minHeight:140,backgroundColor:'#111827',color:'white',padding:12,borderRadius:12,borderWidth:1,borderColor:'#374151',marginBottom:12},btn:{backgroundColor:'#3b82f6',padding:14,borderRadius:12,alignItems:'center',marginTop:8},secondary:{backgroundColor:'#1f2937'},bt:{color:'white',fontWeight:'700'},hint:{color:'#9ca3af',marginTop:12}});